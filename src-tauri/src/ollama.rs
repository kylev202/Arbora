//! Ollama daemon lifecycle: make sure the local daemon is running (spawn it
//! silently if it isn't), health-check it periodically, auto-restart, and warm
//! up the preset's model once so the first chat isn't cold. Deliberately quiet:
//! state changes are `ollama:status` events the pet renders calmly — no toasts.
//!
//! Ownership rule: we only ever kill a daemon *we* spawned. A daemon the user
//! runs themselves is theirs; we just use it.

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
/// binary isn't installed/on PATH — the caller then reports "unavailable".
fn spawn_daemon() -> Result<Child, String> {
    let mut cmd = Command::new("ollama");
    cmd.arg("serve").stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn().map_err(|e| e.to_string())
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
