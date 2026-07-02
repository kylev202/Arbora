//! AI model management for onboarding/Settings: is the preset's Ollama model
//! pulled, and pull-it-with-progress. Thin proxy over the sidecar's `/model`
//! endpoints — no DB rows here; Ollama's own store is the source of truth.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use super::JobHandle;
use crate::sidecar::Sidecar;

/// Mirror of the sidecar's `ModelReadyResponse`. `ollama_running=false` means
/// the daemon was unreachable — a different UI message than "not downloaded".
#[derive(Debug, Serialize, Deserialize)]
pub struct ModelReady {
    pub model: String,
    pub ready: bool,
    pub ollama_running: bool,
}

#[derive(Deserialize)]
struct PullStatusResp {
    state: String,
    progress: f64,
    step: String,
    error: Option<String>,
}

fn sidecar_base(sidecar: &Sidecar) -> Result<(String, String), String> {
    let base = sidecar
        .base_url()
        .filter(|_| sidecar.is_ready())
        .ok_or("SIDECAR_UNAVAILABLE")?;
    Ok((base, sidecar.token().to_string()))
}

/// Whether the preset's model is already in the local Ollama store.
#[tauri::command]
pub async fn model_ready(
    sidecar: State<'_, Sidecar>,
    preset: String,
) -> Result<ModelReady, String> {
    let (base, token) = sidecar_base(&sidecar)?;
    reqwest::Client::new()
        .get(format!("{base}/model/{preset}/ready"))
        .header("X-Arbora-Token", &token)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json::<ModelReady>()
        .await
        .map_err(|e| e.to_string())
}

/// Start pulling the preset's model. Returns the job id immediately; progress
/// and completion arrive as `model:*` events (same pattern as `ingest:*`).
#[tauri::command]
pub async fn download_model(
    app: AppHandle,
    sidecar: State<'_, Sidecar>,
    preset: String,
) -> Result<JobHandle, String> {
    let (base, token) = sidecar_base(&sidecar)?;
    let job_id = Uuid::new_v4().to_string();

    reqwest::Client::new()
        .post(format!("{base}/model/pull"))
        .header("X-Arbora-Token", &token)
        .json(&serde_json::json!({ "job_id": job_id, "preset": preset }))
        .send()
        .await
        .map_err(|e| format!("MODEL_PULL_FAILED: {e}"))?
        .error_for_status()
        .map_err(|e| format!("MODEL_PULL_FAILED: {e}"))?;

    let job = job_id.clone();
    tauri::async_runtime::spawn(async move {
        poll_pull(app, base, token, job, preset).await;
    });

    Ok(JobHandle { job_id })
}

/// Poll the sidecar's pull status and re-emit it as Tauri events.
async fn poll_pull(app: AppHandle, base: String, token: String, job_id: String, preset: String) {
    let client = reqwest::Client::new();
    loop {
        tokio::time::sleep(Duration::from_millis(500)).await;

        let status: PullStatusResp = match client
            .get(format!("{base}/model/pull/{job_id}/status"))
            .header("X-Arbora-Token", &token)
            .send()
            .await
            .and_then(|r| r.error_for_status())
        {
            Ok(resp) => match resp.json().await {
                Ok(s) => s,
                Err(e) => return fail(&app, &job_id, &preset, &e.to_string()),
            },
            Err(e) => return fail(&app, &job_id, &preset, &e.to_string()),
        };

        match status.state.as_str() {
            "done" => {
                let _ = app.emit(
                    "model:done",
                    serde_json::json!({ "job_id": job_id, "preset": preset }),
                );
                return;
            }
            "error" => {
                let msg = status
                    .error
                    .unwrap_or_else(|| "model download failed".into());
                return fail(&app, &job_id, &preset, &msg);
            }
            _ => {
                let _ = app.emit(
                    "model:progress",
                    serde_json::json!({
                        "job_id": job_id, "preset": preset,
                        "progress": status.progress, "step": status.step,
                    }),
                );
            }
        }
    }
}

fn fail(app: &AppHandle, job_id: &str, preset: &str, error: &str) {
    let _ = app.emit(
        "model:error",
        serde_json::json!({ "job_id": job_id, "preset": preset, "error": error }),
    );
}
