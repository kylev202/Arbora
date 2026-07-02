//! Pet companion: one command that routes a message to its valid domain and
//! answers it. Domain A (lessons) reuses the RAG chat path with its
//! authoritative citations (law #1); Domain B (app help) lands in slice C;
//! everything else is a gentle refusal rendered by the UI. Conversations are
//! ephemeral — nothing is persisted (law #2 applies to deck items, not Q&A).

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

use super::chat::{self, ChatCitation, LocationOut};
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
    /// Out of scope — the UI shows the gentle two-domains refusal.
    Refusal,
}

#[derive(Deserialize)]
struct RouteResp {
    domain: String,
}

#[derive(Deserialize)]
struct HelpRef {
    section: i64,
    title: String,
    excerpt: String,
}

#[derive(Deserialize)]
struct HelpResp {
    answer: String,
    refs: Vec<HelpRef>,
}

#[tauri::command]
pub async fn pet_message(
    pool: State<'_, SqlitePool>,
    sidecar: State<'_, Sidecar>,
    question: String,
    subject_id: Option<String>,
) -> Result<PetReply, String> {
    let base = sidecar
        .base_url()
        .filter(|_| sidecar.is_ready())
        .ok_or("SIDECAR_UNAVAILABLE")?;
    let preset = chat::fetch_preset(pool.inner()).await;

    let resp = reqwest::Client::new()
        .post(format!("{base}/pet/route"))
        .header("X-Arbora-Token", sidecar.token())
        .json(&serde_json::json!({ "question": question, "preset": preset }))
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
            Some(sid) => match chat::ask(pool.inner(), &sidecar, &sid, &question).await {
                Ok(r) => Ok(PetReply::Answer {
                    answer: r.answer,
                    citations: r.citations,
                }),
                Err(e) if e.contains("NO_CHUNKS") => Ok(PetReply::NoMaterial),
                Err(e) => Err(e),
            },
        },
        "app_help" => {
            // Domain B: grounded in the packaged help KB; refs cite KB sections.
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
            let citations = help
                .refs
                .into_iter()
                .map(|r| ChatCitation {
                    source_id: "app-help".to_string(),
                    source_title: format!("App guide: {}", r.title),
                    location: LocationOut::Page { page: r.section },
                    excerpt: r.excerpt,
                })
                .collect();
            Ok(PetReply::Answer {
                answer: help.answer,
                citations,
            })
        }
        _ => Ok(PetReply::Refusal),
    }
}
