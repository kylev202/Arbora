//! Ollama daemon lifecycle: make sure the local daemon is running (spawn it
//! silently if it isn't), health-check it periodically, auto-restart, and warm
//! up the preset's model once so the first chat isn't cold. Deliberately quiet:
//! state changes are `ollama:status` events the pet renders calmly — no toasts.
//!
//! Ownership rule: we only ever kill a daemon *we* spawned. A daemon the user
//! runs themselves is theirs; we just use it.

use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

use crate::sidecar::Sidecar;

const OLLAMA_URL: &str = "http://127.0.0.1:11434";
/// Poll cadence while healthy (cheap loopback GET).
const CHECK_INTERVAL: Duration = Duration::from_secs(15);
/// Retry cadence while the daemon is missing and unspawnable (not installed).
const UNAVAILABLE_INTERVAL: Duration = Duration::from_secs(60);
/// How long to wait for a daemon we just spawned to come up.
const SPAWN_RETRIES: u32 = 20;
const SPAWN_INTERVAL: Duration = Duration::from_millis(500);

/// Managed Tauri state for the Ollama daemon.
pub struct Ollama {
    ready: AtomicBool,
    spawned: Mutex<Option<Child>>,
}

impl Ollama {
    pub fn new() -> Self {
        Self {
            ready: AtomicBool::new(false),
            spawned: Mutex::new(None),
        }
    }

    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::SeqCst)
    }

    /// Kill the daemon only if we spawned it (a user's own daemon is left alone).
    /// Killing our child unloads any model it held — no zombies, no stuck port.
    pub fn kill(&self) {
        if let Some(mut child) = self.spawned.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[derive(Serialize)]
pub struct OllamaStatus {
    pub ready: bool,
}

/// Supervise the daemon forever. Intended for a dedicated thread; exits never.
pub fn run_lifecycle(app: AppHandle) {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .expect("build http client");

    let mut warmed_preset: Option<String> = None;
    let mut announced_unavailable = false;

    loop {
        let state = app.state::<Ollama>();
        let was_ready = state.is_ready();
        let up = daemon_up(&client);

        if up && !was_ready {
            state.ready.store(true, Ordering::SeqCst);
            announced_unavailable = false;
            eprintln!("[arbora] ollama ready");
            let _ = app.emit("ollama:status", json!({ "state": "ready" }));
        } else if !up && was_ready {
            state.ready.store(false, Ordering::SeqCst);
            eprintln!("[arbora] ollama went away; restarting");
            let _ = app.emit("ollama:status", json!({ "state": "starting" }));
        }

        if !up {
            // Reap a dead child before respawning so `spawned` stays accurate.
            {
                let mut guard = state.spawned.lock().unwrap();
                if let Some(child) = guard.as_mut() {
                    if let Ok(Some(_)) = child.try_wait() {
                        *guard = None;
                    }
                }
            }
            match spawn_daemon() {
                Ok(child) => {
                    *state.spawned.lock().unwrap() = Some(child);
                    // Give it a moment; the next loop iteration re-checks.
                    for _ in 0..SPAWN_RETRIES {
                        if daemon_up(&client) {
                            break;
                        }
                        std::thread::sleep(SPAWN_INTERVAL);
                    }
                    continue; // re-enter loop immediately to flip ready + warm up
                }
                Err(err) => {
                    if !announced_unavailable {
                        eprintln!("[arbora] ollama unavailable: {err}");
                        let _ = app.emit("ollama:status", json!({ "state": "unavailable" }));
                        announced_unavailable = true;
                    }
                    std::thread::sleep(UNAVAILABLE_INTERVAL);
                    continue;
                }
            }
        }

        // Healthy: warm the preset's model once per preset value (so a preset
        // change in Settings re-warms on the next pass).
        let preset = current_preset(&app);
        if warmed_preset.as_deref() != Some(preset.as_str()) && warmup(&app, &preset) {
            warmed_preset = Some(preset);
        }

        std::thread::sleep(CHECK_INTERVAL);
    }
}

fn daemon_up(client: &reqwest::blocking::Client) -> bool {
    client
        .get(format!("{OLLAMA_URL}/api/version"))
        .send()
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// Spawn `ollama serve` with no console window and detached IO. Fails when the
/// binary isn't installed anywhere we look — the caller then reports "unavailable".
fn spawn_daemon() -> Result<Child, String> {
    let bin = ollama_binary().ok_or("ollama not installed")?;
    let mut cmd = Command::new(&bin);
    cmd.arg("serve").stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn().map_err(|e| e.to_string())
}

/// Resolve the ollama executable: an explicit override, then PATH, then the
/// per-OS default install location. The last case matters right after a
/// first-run install — the running process's PATH won't yet include Ollama.
fn ollama_binary() -> Option<PathBuf> {
    let exe = if cfg!(windows) {
        "ollama.exe"
    } else {
        "ollama"
    };

    if let Ok(p) = std::env::var("ARBORA_OLLAMA") {
        let p = PathBuf::from(p);
        if p.exists() {
            return Some(p);
        }
    }
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            let cand = dir.join(exe);
            if cand.exists() {
                return Some(cand);
            }
        }
    }
    default_install_paths().into_iter().find(|p| p.exists())
}

/// Where each OS's official Ollama installer drops the executable.
fn default_install_paths() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var("LOCALAPPDATA")
            .map(|local| vec![PathBuf::from(local).join(r"Programs\Ollama\ollama.exe")])
            .unwrap_or_default()
    }
    #[cfg(target_os = "macos")]
    {
        let mut v = vec![
            PathBuf::from("/Applications/Ollama.app/Contents/Resources/ollama"),
            PathBuf::from("/usr/local/bin/ollama"),
        ];
        if let Ok(home) = std::env::var("HOME") {
            v.push(PathBuf::from(home).join("Applications/Ollama.app/Contents/Resources/ollama"));
        }
        v
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        vec![
            PathBuf::from("/usr/local/bin/ollama"),
            PathBuf::from("/usr/bin/ollama"),
        ]
    }
}

fn current_preset(app: &AppHandle) -> String {
    let pool = app.state::<sqlx::SqlitePool>();
    tauri::async_runtime::block_on(async {
        sqlx::query_as::<_, (String,)>("SELECT ai_preset FROM settings WHERE id = 1")
            .fetch_one(pool.inner())
            .await
            .map(|(p,)| p)
            .unwrap_or_else(|_| "medium".to_string())
    })
}

/// Ask the sidecar to load the preset's model (empty-prompt generate). Returns
/// true when accepted; false to retry on a later pass (e.g. sidecar not up yet).
fn warmup(app: &AppHandle, preset: &str) -> bool {
    let sidecar = app.state::<Sidecar>();
    let Some(base) = sidecar.base_url().filter(|_| sidecar.is_ready()) else {
        return false;
    };
    let client = reqwest::blocking::Client::new();
    client
        .post(format!("{base}/model/warmup"))
        .header("X-Arbora-Token", sidecar.token())
        .json(&json!({ "preset": preset }))
        .send()
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// Current daemon readiness, for the pet's "getting ready…" hint.
#[tauri::command]
pub fn ollama_status(state: tauri::State<'_, Ollama>) -> OllamaStatus {
    OllamaStatus {
        ready: state.is_ready(),
    }
}

// ── First-run install (auto-run Ollama's official installer) ───────────────

/// Whether the Ollama executable is present anywhere we know to look.
#[tauri::command]
pub fn ollama_installed() -> bool {
    ollama_binary().is_some()
}

/// Download and run Ollama's official installer, reporting progress as
/// `ollama-install:*` events. Returns immediately; the work runs on a thread and
/// the daemon supervisor (`run_lifecycle`) brings Ollama up once it's installed.
#[tauri::command]
pub fn install_ollama(app: AppHandle) -> Result<(), String> {
    if ollama_binary().is_some() {
        let _ = app.emit("ollama-install:done", json!({ "already": true }));
        return Ok(());
    }
    std::thread::spawn(move || match do_install(&app) {
        Ok(()) => {
            let _ = app.emit("ollama-install:done", json!({}));
        }
        Err(err) => {
            eprintln!("[arbora] ollama install failed: {err}");
            let _ = app.emit("ollama-install:error", json!({ "error": err }));
        }
    });
    Ok(())
}

#[cfg(windows)]
const OLLAMA_INSTALLER_URL: &str = "https://ollama.com/download/OllamaSetup.exe";
#[cfg(target_os = "macos")]
const OLLAMA_INSTALLER_URL: &str = "https://ollama.com/download/Ollama-darwin.zip";
#[cfg(all(unix, not(target_os = "macos")))]
const OLLAMA_INSTALLER_URL: &str = "https://ollama.com/install.sh";

fn do_install(app: &AppHandle) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60 * 60)) // a large installer over a slow link
        .build()
        .map_err(|e| e.to_string())?;

    let file_name = OLLAMA_INSTALLER_URL
        .rsplit('/')
        .next()
        .unwrap_or("ollama-installer");
    let installer = std::env::temp_dir().join(file_name);

    download(&client, app, OLLAMA_INSTALLER_URL, &installer)?;

    let _ = app.emit(
        "ollama-install:progress",
        json!({ "progress": 0.99, "step": "installing" }),
    );
    run_installer(&installer)
}

/// Stream a URL to `dest`, emitting the download fraction as progress events.
fn download(
    client: &reqwest::blocking::Client,
    app: &AppHandle,
    url: &str,
    dest: &std::path::Path,
) -> Result<(), String> {
    let mut resp = client
        .get(url)
        .send()
        .map_err(|e| format!("download failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("download failed: {e}"))?;

    let total = resp.content_length().unwrap_or(0);
    let mut file = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut buf = [0u8; 1 << 16];
    let mut done: u64 = 0;
    loop {
        let n = resp.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        done += n as u64;
        let frac = if total > 0 {
            (done as f64 / total as f64).min(0.98)
        } else {
            0.0
        };
        let _ = app.emit(
            "ollama-install:progress",
            json!({ "progress": frac, "step": "downloading" }),
        );
    }
    Ok(())
}

#[cfg(windows)]
fn run_installer(installer: &std::path::Path) -> Result<(), String> {
    // OllamaSetup.exe is an Inno Setup installer (per-user, no admin) that also
    // starts the daemon once installed.
    let status = Command::new(installer)
        .args(["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"])
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("installer exited with {status}"));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn run_installer(installer: &std::path::Path) -> Result<(), String> {
    // The download is a zip of Ollama.app; extract into ~/Applications
    // (user-writable, no admin) and launch it so its daemon starts.
    let home = std::env::var("HOME").map_err(|_| "no HOME".to_string())?;
    let apps = PathBuf::from(&home).join("Applications");
    std::fs::create_dir_all(&apps).map_err(|e| e.to_string())?;
    let status = Command::new("ditto")
        .args([
            "-x",
            "-k",
            installer.to_string_lossy().as_ref(),
            apps.to_string_lossy().as_ref(),
        ])
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("extract failed with {status}"));
    }
    Command::new("open")
        .arg(apps.join("Ollama.app"))
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn run_installer(installer: &std::path::Path) -> Result<(), String> {
    // Linux isn't a shipping target; run the official script best-effort.
    let status = Command::new("sh")
        .arg(installer)
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("install script exited with {status}"));
    }
    Ok(())
}
