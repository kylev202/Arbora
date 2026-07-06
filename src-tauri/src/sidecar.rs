//! Python AI sidecar lifecycle: spawn, discover its loopback port, health-check,
//! and tear it down on app exit.
//!
//! Contract (see resources/Phase1_IPC_Contract.md §5): the sidecar prints
//! `ARBORA_SIDECAR_PORT=<port>` on stdout, then serves `GET /health`.

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

const PORT_MARKER: &str = "ARBORA_SIDECAR_PORT=";
const HEALTH_RETRIES: u32 = 40;
const HEALTH_INTERVAL: Duration = Duration::from_millis(250);

/// Managed Tauri state holding the running sidecar.
pub struct Sidecar {
    child: Mutex<Option<Child>>,
    base_url: Mutex<Option<String>>,
    ready: AtomicBool,
    /// Per-launch shared secret required on every sidecar request (loopback auth).
    token: String,
}

impl Sidecar {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            base_url: Mutex::new(None),
            ready: AtomicBool::new(false),
            token: uuid::Uuid::new_v4().to_string(),
        }
    }

    pub fn base_url(&self) -> Option<String> {
        self.base_url.lock().unwrap().clone()
    }

    /// The per-launch auth token to send as `X-Arbora-Token` on every request.
    pub fn token(&self) -> &str {
        &self.token
    }

    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::SeqCst)
    }

    /// Kill the child process. Called on app exit to avoid a zombie sidecar.
    pub fn kill(&self) {
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[derive(Serialize)]
pub struct SidecarStatus {
    pub ready: bool,
    pub base_url: Option<String>,
}

/// Spawn the sidecar and drive it to `ready`, emitting `sidecar:status` events.
/// Intended to run on a dedicated thread.
pub fn run_lifecycle(app: AppHandle) {
    let _ = app.emit("sidecar:status", json!({ "state": "starting" }));

    let state = app.state::<Sidecar>();
    let token = state.token().to_string();
    let data_dir = app.path().app_data_dir().ok();
    let resource_dir = app.path().resource_dir().ok();

    let (child, base_url) =
        match spawn_process(&token, data_dir.as_deref(), resource_dir.as_deref()) {
            Ok(pair) => pair,
            Err(err) => {
                eprintln!("[arbora] sidecar failed to start: {err}");
                let _ = app.emit(
                    "sidecar:status",
                    json!({ "state": "crashed", "error": err }),
                );
                return;
            }
        };

    *state.child.lock().unwrap() = Some(child);
    *state.base_url.lock().unwrap() = Some(base_url.clone());

    if wait_healthy(&base_url) {
        state.ready.store(true, Ordering::SeqCst);
        eprintln!("[arbora] sidecar ready @ {base_url}");
        let _ = app.emit("sidecar:status", json!({ "state": "ready" }));
    } else {
        eprintln!("[arbora] sidecar health check timed out @ {base_url}");
        let _ = app.emit(
            "sidecar:status",
            json!({ "state": "crashed", "error": "health check timed out" }),
        );
    }
}

fn spawn_process(
    token: &str,
    data_dir: Option<&Path>,
    resource_dir: Option<&Path>,
) -> Result<(Child, String), String> {
    let (mut cmd, desc) = build_command(resource_dir);
    cmd.env("ARBORA_SIDECAR_TOKEN", token)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    // FAISS indexes live under the app data dir; the sidecar writes them there.
    if let Some(dir) = data_dir {
        cmd.env("ARBORA_DATA_DIR", dir);
    }
    #[cfg(windows)]
    {
        // The frozen sidecar is a console binary (Rust parses its stdout). Without
        // CREATE_NO_WINDOW a console window flashes when the GUI app spawns it.
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to spawn sidecar ({desc}): {e}"))?;

    let stdout = child.stdout.take().ok_or("sidecar stdout unavailable")?;
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();

    let base_url = loop {
        line.clear();
        let n = reader
            .read_line(&mut line)
            .map_err(|e| format!("reading sidecar stdout: {e}"))?;
        if n == 0 {
            return Err("sidecar exited before announcing its port".into());
        }
        if let Some(rest) = line.trim().strip_prefix(PORT_MARKER) {
            let port: u16 = rest
                .trim()
                .parse()
                .map_err(|_| format!("invalid sidecar port: {rest:?}"))?;
            break format!("http://127.0.0.1:{port}");
        }
    };

    // Keep draining stdout so the pipe buffer never blocks the child.
    std::thread::spawn(move || {
        let mut sink = String::new();
        while reader.read_line(&mut sink).unwrap_or(0) > 0 {
            sink.clear();
        }
    });

    Ok((child, base_url))
}

fn wait_healthy(base_url: &str) -> bool {
    let client = reqwest::blocking::Client::new();
    let url = format!("{base_url}/health");
    for _ in 0..HEALTH_RETRIES {
        if let Ok(resp) = client.get(&url).send() {
            if resp.status().is_success() {
                return true;
            }
        }
        std::thread::sleep(HEALTH_INTERVAL);
    }
    false
}

/// Build the launch command for the sidecar. Production prefers the frozen
/// binary bundled as a Tauri resource; dev falls back to running the module from
/// a Python interpreter. Returns the command plus a human label for error text.
fn build_command(resource_dir: Option<&Path>) -> (Command, String) {
    if let Some(bin) = resource_dir.and_then(packaged_sidecar_binary) {
        let mut cmd = Command::new(&bin);
        // Run from the bundle dir so relative lookups resolve inside it.
        if let Some(parent) = bin.parent() {
            cmd.current_dir(parent);
        }
        let desc = format!("{bin:?}");
        return (cmd, desc);
    }
    let dir = sidecar_dir();
    let python = python_exe(&dir);
    let mut cmd = Command::new(&python);
    cmd.args(["-m", "arbora_ai.server"]).current_dir(&dir);
    (cmd, format!("{python:?}"))
}

/// The frozen sidecar binary bundled under the app's resource dir, if present.
/// Built by `scripts/build_sidecar.py` into `src-tauri/binaries/` and shipped via
/// `tauri.conf.json` `bundle.resources`.
fn packaged_sidecar_binary(resource_dir: &Path) -> Option<PathBuf> {
    let name = if cfg!(windows) {
        "arbora-sidecar.exe"
    } else {
        "arbora-sidecar"
    };
    let path = resource_dir
        .join("binaries")
        .join("arbora-sidecar")
        .join(name);
    path.exists().then_some(path)
}

/// Locate the sidecar source directory. Dev default is the sibling `sidecar/`
/// crate of this Rust core; bundling resolves a packaged path via `build_command`.
fn sidecar_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("ARBORA_SIDECAR_DIR") {
        return PathBuf::from(dir);
    }
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../sidecar")
}

/// Choose the Python interpreter: explicit override, then the sidecar venv,
/// then a bare `python` on PATH.
fn python_exe(sidecar_dir: &Path) -> PathBuf {
    if let Ok(p) = std::env::var("ARBORA_PYTHON") {
        return PathBuf::from(p);
    }
    let venv = if cfg!(windows) {
        sidecar_dir.join(".venv/Scripts/python.exe")
    } else {
        sidecar_dir.join(".venv/bin/python")
    };
    if venv.exists() {
        venv
    } else {
        PathBuf::from("python")
    }
}
