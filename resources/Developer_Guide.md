# Arbora — Developer Guide (Tóm tắt Kỹ thuật cho Developer)

> **Mục đích:** Tài liệu một-điểm-dừng cho developer: **tiêu chí kỹ thuật**, **thông tin dự án cô đọng**, **cấu trúc source code**.
> **Trạng thái:** Planning — *chưa code*. Cấu trúc dưới đây là **bản thiết kế đề xuất**, tinh chỉnh khi dựng skeleton.
> **Liên quan:** [`Arbora_Project_Proposal.md`](./Arbora_Project_Proposal.md) · [`Arbora_Project_Checklist.md`](./Arbora_Project_Checklist.md) · [`StudyForge_Overview.md`](./StudyForge_Overview.md)

---

## 1. TL;DR cho developer

Arbora = **desktop app local-first**: **Tauri 2 (Rust core) + React UI** điều phối một **Python sidecar** lo toàn bộ AI. Dữ liệu trong **SQLite** (+ **FAISS** cho RAG). LLM qua **Ollama** (local) hoặc **endpoint OpenAI-compatible** (BYO key). Pipeline lõi:

```
Tài liệu (PDF/slide/audio)
   → [sidecar] parse / transcribe (Whisper)
   → [sidecar] chunk + embed → FAISS (RAG)
   → [sidecar] LLM sinh structured JSON (notes/flashcard/quiz)  ← GROUNDED vào nguồn
   → validate schema → trả về Rust qua IPC
   → [React UI] review/edit (BẮT BUỘC) → lưu SQLite
   → [sidecar] FSRS lên lịch ôn → [UI] ôn tập + dashboard (cây lớn)
```

**Ba luật bất di bất dịch:** (1) nội dung AI **grounded + có trích dẫn**; (2) **review-before-trust**; (3) **không gì rời máy** trừ khi user bật BYO-key/online có nhãn.

---

## 2. Tiêu chí kỹ thuật (Engineering Criteria)

| Tiêu chí | Yêu cầu cụ thể |
|---|---|
| **Local-first / Offline** | Lõi chạy không internet sau khi tải model. Không telemetry mặc định. |
| **Grounding** | LLM chỉ sinh từ nội dung nguồn; cấm bịa ngoài tài liệu. |
| **Structured output** | Đầu ra AI theo **JSON schema / Pydantic / GBNF**. Sai schema → reject + retry. |
| **Citation** | Mỗi flashcard/quiz/note item gắn `source_id` + `page`/`timestamp`. |
| **Review-before-trust** | Không item AI nào vào deck ôn nếu chưa qua màn review. |
| **Provider-agnostic** | LLM client sau một interface: local (Ollama) ↔ remote (OpenAI-compatible). |
| **Hiệu năng máy yếu** | Preset 1.5B–3B (Q4) + Whisper tiny/base. *Test trên máy yếu là bắt buộc.* |
| **Determinism khi cần** | Temperature thấp/seed cho structured output để ổn định & test được. |
| **Tách biệt rủi ro** | Code gọi mạng (BYO key/online) ở module riêng, **không** import vào lõi. |
| **Pin version** | Khóa version Rust/npm/Python — tránh "dependency & CUDA hell". |
| **Cross-platform** | Không giả định OS; ưu tiên whisper.cpp + Ollama chạy mọi nơi. |

---

## 3. Thông tin dự án cô đọng

- **Sản phẩm:** Arbora — không gian học tập local-first; ingest tài liệu → notes/flashcard/quiz/sơ đồ có trích dẫn → ôn FSRS → quản lý môn/lịch/deadline/điểm → động lực "cây phát triển" & hỗ trợ ADHD.
- **Định vị:** open-source (MIT), miễn phí, riêng tư, cài-một-lần. (Chi tiết: Proposal.)
- **Lộ trình:** Pha 0 (spike) → 1 (MVP một môn) → 2 (đa môn/RAG/Mermaid) → 3 (cây/ADHD) → 4 (NotebookLM-local) → 5 (phân phối).
- **Non-goals:** không server API trung tâm; không phụ thuộc API NotebookLM; không "phát hiện phong cách học"; không sinh ảnh AI nặng trong lõi; không tự viết scheduler.

---

## 4. Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────────────┐
│                     Tauri 2 Desktop App                      │
│                                                              │
│  ┌────────────────────┐        ┌─────────────────────────┐  │
│  │   React UI          │  IPC   │   Rust Core (src-tauri) │  │
│  │  - màn hình         │◄──────►│  - Tauri commands       │  │
│  │  - review/edit      │ invoke │  - SQLite (sqlx)        │  │
│  │  - dashboard (cây)  │ /event │  - sidecar lifecycle    │  │
│  └────────────────────┘        └───────────┬─────────────┘  │
│                                             │ HTTP/stdio JSON │
│                                  ┌──────────▼──────────────┐ │
│                                  │  Python Sidecar (AI)    │ │
│                                  │  - ingest/parse/OCR     │ │
│                                  │  - transcribe (Whisper) │ │
│                                  │  - RAG (embed+retrieve) │ │
│                                  │  - LLM gen (provider)   │ │
│                                  │  - FSRS · genanki       │ │
│                                  └──────┬─────────┬────────┘ │
│                                         │         │          │
│                    ┌────────────────────▼──┐  ┌───▼────────┐ │
│                    │ LLM provider:          │  │   FAISS    │ │
│                    │  Ollama (local)  OR    │  │  (vectors) │ │
│                    │  OpenAI-compat (BYOK)  │  └────────────┘ │
│                    └────────────────────────┘                │
│                                                              │
│   SQLite (môn/note/thẻ/quiz/lịch/điểm/tiến độ) ── nguồn dữ liệu chính │
└─────────────────────────────────────────────────────────────┘
```

**Phân vai:**
- **React UI** — trình bày, tương tác, review/edit. Không chứa logic AI.
- **Rust core** — điều phối: vòng đời sidecar, SQLite & filesystem, expose Tauri commands cho UI, định tuyến request sang sidecar.
- **Python sidecar** — toàn bộ AI (Whisper, embeddings, LLM client, genanki, FSRS đều ở hệ Python).

**IPC:** React ↔ Rust qua `invoke`/event Tauri; Rust ↔ Python qua **local HTTP** (FastAPI trên cổng loopback — khuyến nghị, dễ stream tiến trình) hoặc stdio JSON-RPC.

**LLM provider abstraction:** một interface chung `generate(prompt, schema) -> json`; hai cài đặt: `OllamaProvider` (local) và `OpenAICompatProvider` (BYO key — OpenAI/Gemini/Anthropic/OpenRouter/endpoint tùy chỉnh). Lõi chỉ gọi interface, không biết provider nào.

---

## 5. Cấu trúc source code (đề xuất — monorepo)

```
arbora/
├── README.md
├── LICENSE                       # MIT
├── CONTRIBUTING.md
├── .gitignore
├── .github/workflows/ci.yml      # lint + test + build 3 OS
│
├── src/                          # ── FRONTEND (React) ──
│   ├── routes/ (hoặc pages/)     # subjects, workspace, review, study, dashboard
│   ├── components/               # cards, editor, charts, tree (cây phát triển)
│   ├── features/                 # theo 5 trụ: organize/ generate/ practice/ plan/ motivate/
│   ├── lib/
│   │   ├── ipc.ts                # wrapper gọi Tauri commands (typed)
│   │   └── api/                  # client cho từng nhóm command
│   ├── stores/                   # state (subjects, study session, settings)
│   ├── styles/                   # design system (calm, low-overwhelm)
│   └── main.tsx
│
├── src-tauri/                    # ── RUST CORE ──
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/             # subjects, sources, generate, srs, grades…
│   │   ├── sidecar/              # spawn/health-check/route Python sidecar
│   │   ├── db/
│   │   │   ├── mod.rs            # SQLite (sqlx)
│   │   │   ├── models.rs
│   │   │   └── migrations/       # SQL migrations (đánh số)
│   │   ├── ipc/                  # kiểu request/response chia sẻ với sidecar
│   │   └── error.rs
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   └── icons/
│
├── sidecar/                      # ── PYTHON AI SIDECAR ──
│   ├── arbora_ai/
│   │   ├── __init__.py
│   │   ├── server.py             # FastAPI (loopback) / stdio JSON-RPC
│   │   ├── config.py             # presets RAM, đường dẫn model
│   │   ├── ingest/               # PDF (PyMuPDF), slide (python-pptx), OCR (Tesseract)
│   │   ├── transcribe/           # faster-whisper / whisper.cpp + VAD
│   │   ├── rag/                  # chunking, embeddings (nomic/bge), FAISS index
│   │   ├── llm/
│   │   │   ├── provider.py       # interface + OllamaProvider + OpenAICompatProvider
│   │   │   ├── prompts/          # few-shot cho notes/flashcard/quiz/diagram
│   │   │   └── structured.py     # JSON/GBNF, validate + retry
│   │   ├── generate/             # notes.py, flashcards.py, quiz.py, diagram_mermaid.py
│   │   ├── srs/                  # wrapper FSRS
│   │   ├── export/               # genanki (.apkg), AnkiConnect
│   │   ├── schemas/              # Pydantic (output AI + citation)
│   │   └── tts/                  # (Pha 4) Piper/Kokoro
│   ├── tests/
│   ├── pyproject.toml
│   └── requirements.lock         # pin version
│
├── shared/                       # ── HỢP ĐỒNG CHIA SẺ ──
│   ├── schemas/                  # JSON Schema dùng chung (UI ↔ Rust ↔ Python)
│   └── types/                    # TS types sinh từ schema
│
├── scripts/                      # setup, download-models, build
├── docs/                         # tài liệu kỹ thuật
└── resources/                    # tài liệu kế hoạch (overview/proposal/checklist/dev-guide)
```

> **Ghi chú cấu trúc:**
> - **`features/`** ánh xạ 1–1 với 5 trụ cột (organize/generate/practice/plan/motivate) — `motivate/` chứa logic & hiển thị "cây phát triển".
> - **`shared/schemas`** là *nguồn chân lý* cho hợp đồng dữ liệu 3 lớp; sinh TS types từ đây để tránh lệch.
> - **`llm/provider.py`** cô lập mọi khác biệt local vs cloud — lõi không bao giờ phụ thuộc provider cụ thể.

---

## 6. Mô hình dữ liệu (đề xuất — SQLite)

| Bảng | Trường chính | Ghi chú |
|---|---|---|
| `subjects` | id, name, color, created_at | Mỗi môn = một workspace = một nhánh cây |
| `sources` | id, subject_id, type(pdf/slide/audio), path, title, ingested_at | Tài liệu gốc |
| `chunks` | id, source_id, text, page/timestamp, faiss_id | Đơn vị cho RAG + citation |
| `notes` | id, subject_id, content, format(cornell/outline), source_refs | Ghi chú có cấu trúc |
| `cards` | id, subject_id, front, back, explanation, source_ref, reviewed(bool) | Flashcard; `reviewed`=đã duyệt |
| `card_schedule` | card_id, due, stability, difficulty, state, last_review | **FSRS state** |
| `quizzes` / `quiz_items` | id, subject_id, question, options, answer, explanation, source_ref | Quiz trắc nghiệm |
| `deadlines` | id, subject_id, title, due_at, type | Lịch/deadline |
| `study_sessions` | id, subject_id, planned_at, duration, kind | Phiên ôn (tự rải từ deadline) |
| `grades` | id, subject_id, name, category, score, weight | Sổ điểm / GPA / what-if |
| `concepts` | id, subject_id, name, mastery_state | Knowledge map (Pha 2) → lá/quả trên cây |

**Vector store:** embeddings của `chunks` lưu trong **FAISS** (index theo `subject_id` để RAG khoanh vùng theo môn); ánh xạ `chunk.faiss_id ↔ FAISS id` để truy ngược citation.

---

## 7. Quy ước & nguyên tắc code

- **Ngôn ngữ:** tài liệu kế hoạch tiếng Việt; code & comment kỹ thuật tiếng Anh (chuẩn open-source).
- **Citation là first-class:** item AI không truy được nguồn → coi là lỗi, không lưu.
- **Structured output:** không parse free-text từ LLM. Ràng buộc schema → validate (Pydantic) → retry N lần → báo lỗi rõ.
- **Sidecar stateless về UI:** nhận request + dữ liệu cần, trả kết quả; state bền vững ở SQLite do Rust quản.
- **Lỗi sidecar không sập app:** Rust giám sát health, tự restart, báo UI thân thiện.
- **Online = opt-in & cô lập:** code gọi mạng trong module có cờ bật/tắt; lõi không import.
- **Test máy yếu:** giữ preset 3B + Whisper base làm cấu hình kiểm thử chuẩn.

---

## 8. Tech stack (tham chiếu nhanh)

| Lớp | Lựa chọn | Quyết định |
|---|---|---|
| Desktop shell | Tauri 2 (Rust) | ✅ |
| UI framework | **React** | ✅ |
| DB | SQLite (qua `sqlx`) | ✅ |
| Vector store | **FAISS** | ✅ |
| AI runtime | Python sidecar (FastAPI loopback / stdio) | ✅ |
| LLM (local) | Ollama (hoặc llama.cpp) | ✅ |
| LLM (BYO key) | endpoint OpenAI-compatible (OpenAI/Gemini/Anthropic/OpenRouter) | ✅ tùy chọn |
| Model mặc định | **Qwen3** — 4B (🌱) / 8B (🌿) / 14B (🌳), Q4_K_M | ✅ chốt — xem [`Phase0_Model_Presets.md`](./Phase0_Model_Presets.md) |
| Transcribe | faster-whisper / whisper.cpp + VAD | ✅ |
| Embeddings | nomic-embed-text / bge-small | ✅ |
| Sơ đồ | Mermaid.js (render local) | ✅ |
| Flashcard export | genanki (.apkg) / AnkiConnect | ✅ |
| Spaced repetition | thư viện FSRS | ✅ |
| Parsing | PyMuPDF, python-pptx, Tesseract, ffmpeg | ✅ |
| TTS (Pha 4) | Piper / Kokoro | ⏳ |

---

## 9. Thiết lập môi trường dev (chi tiết hóa khi dựng skeleton)

```
# Yêu cầu: Rust toolchain, Node.js, Python 3.x, Ollama
# 1. Cài Ollama + pull model preset (vd: qwen2.5:3b)
# 2. sidecar:  cd sidecar && python -m venv .venv && pip install -r requirements.lock
# 3. frontend: npm install
# 4. dev:      npm run tauri dev   (Tauri spawn sidecar tự động)
```

- Máy dev hiện tại (xác nhận 2026-06): **RTX 4070 12GB VRAM + 16GB RAM + Ryzen 7 5700X**. Daily driver **Qwen3 8B (🌿)**; 14B (🌳) làm trần chất lượng — xem [`Phase0_Model_Presets.md`](./Phase0_Model_Presets.md) §4.
- **⚠️ Lưu ý:** máy dev mạnh ≠ máy user. **Luôn test trên preset máy yếu (🌱 Qwen3 4B / 8GB)** để tránh ship thứ laptop phổ thông không chạy nổi.

---

## 10. Rủi ro kỹ thuật cần nhớ

- ⚠️ **Hallucination của LLM nhỏ** → grounding + citation + review-before-trust + structured output. *Rủi ro #1.*
- ⚠️ **Máy yếu** → preset bậc thấp + BYO key làm lối thoát; *không* tự dựng server trung tâm.
- ⚠️ **Dependency / CUDA hell khi đóng gói** → pin version, ưu tiên whisper.cpp + Ollama, CI build 3 OS sớm.
- ⚠️ **Sidecar lifecycle** (zombie process, cổng kẹt) → Rust quản chặt spawn/kill + health check.
- ⚠️ **Phạm vi rộng** → bám checklist theo pha; mỗi pha ra bản dùng được trọn vẹn.

---

*Developer Guide v1.1 — giai đoạn planning. Tên sản phẩm: **Arbora**. Cấu trúc source code là đề xuất, tinh chỉnh khi dựng skeleton (Giai đoạn 2 trong [`Arbora_Project_Checklist.md`](./Arbora_Project_Checklist.md)).*
