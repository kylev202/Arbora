//! Pet companion: one command that routes a message to its valid domain and
//! answers it. Domain A (lessons) reuses the RAG chat path with its
//! authoritative citations (law #1); Domain B (app help) lands in slice C;
//! everything else is a gentle refusal rendered by the UI. Conversations are
//! ephemeral — nothing is persisted (law #2 applies to deck items, not Q&A).

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

use super::chat::{self, ChatCitation, ChatHistoryTurn};
use crate::sidecar::Sidecar;

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PetReply {
    /// A grounded lesson answer with authoritative citations.
    Answer {
        answer: String,
        citations: Vec<ChatCitation>,
    },
    /// Lesson question but no subject context — the UI asks the user to pick one.
    NeedsSubject,
    /// Lesson question but the subject has no indexed material yet.
    NoMaterial,
    /// A scheduling ask — the UI runs the week planner and shows proposal
    /// cards (the single review-gated scheduler path, law #2).
    ScheduleRequest,
    /// Out of scope — the UI shows the gentle two-domains refusal.
    Refusal,
}

#[derive(Deserialize)]
struct RouteResp {
    domain: String,
}

#[derive(Deserialize)]
struct HelpResp {
    answer: String,
}

#[tauri::command]
pub async fn pet_message(
    pool: State<'_, SqlitePool>,
    sidecar: State<'_, Sidecar>,
    question: String,
    subject_id: Option<String>,
    history: Option<Vec<ChatHistoryTurn>>,
) -> Result<PetReply, String> {
    let history = history.unwrap_or_default();
    let base = sidecar
        .base_url()
        .filter(|_| sidecar.is_ready())
        .ok_or("SIDECAR_UNAVAILABLE")?;
    let preset = chat::fetch_preset(pool.inner()).await;

    // History goes to the router too: a bare follow-up ("why?") only
    // classifies correctly when the router can see what it continues.
    let resp = reqwest::Client::new()
        .post(format!("{base}/pet/route"))
        .header("X-Arbora-Token", sidecar.token())
        .json(&serde_json::json!({ "question": question, "preset": preset, "history": history }))
        .send()
        .await
        .map_err(|e| format!("PET_FAILED: {e}"))?;
    if resp.status().as_u16() == 503 {
        return Err("OLLAMA_UNAVAILABLE".to_string());
    }
    let route: RouteResp = resp
        .error_for_status()
        .map_err(|e| format!("PET_FAILED: {e}"))?
        .json()
        .await
        .map_err(|e| format!("PET_FAILED: {e}"))?;

    match route.domain.as_str() {
        "lesson" => match subject_id {
            None => Ok(PetReply::NeedsSubject),
            Some(sid) => match chat::ask(pool.inner(), &sidecar, &sid, &question, &history).await {
                Ok(r) => Ok(PetReply::Answer {
                    answer: r.answer,
                    citations: r.citations,
                }),
                Err(e) if e.contains("NO_CHUNKS") => Ok(PetReply::NoMaterial),
                Err(e) => Err(e),
            },
        },
        "schedule" => Ok(PetReply::ScheduleRequest),
        "app_help" => {
            // Domain B: grounded in the packaged help KB. The KB still cites its
            // sections server-side, but app-help answers are shown WITHOUT citation
            // chips — only answers drawn from the user's own material carry visible
            // citations. The KB refs are intentionally dropped here.
            let resp = reqwest::Client::new()
                .post(format!("{base}/pet/help"))
                .header("X-Arbora-Token", sidecar.token())
                .json(&serde_json::json!({ "question": question, "preset": preset }))
                .send()
                .await
                .map_err(|e| format!("PET_FAILED: {e}"))?;
            if resp.status().as_u16() == 503 {
                return Err("OLLAMA_UNAVAILABLE".to_string());
            }
            let help: HelpResp = resp
                .error_for_status()
                .map_err(|e| format!("PET_FAILED: {e}"))?
                .json()
                .await
                .map_err(|e| format!("PET_FAILED: {e}"))?;
            Ok(PetReply::Answer {
                answer: help.answer,
                citations: Vec::new(),
            })
        }
        _ => Ok(PetReply::Refusal),
    }
}
