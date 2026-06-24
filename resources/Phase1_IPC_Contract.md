# Arbora — IPC Contract (Phase 1)

> **Mục đích:** Hợp đồng dữ liệu giữa ba lớp: React UI ↔ Rust core (Tauri commands) ↔ Python sidecar (HTTP loopback). Đây là *nguồn chân lý* để sinh TypeScript types, Rust structs, và Pydantic models ở Phase 2.
> **Trạng thái:** v1 — Phase 1 Design. Chưa code. Cập nhật khi skeleton lộ ra vấn đề thực tế.
> **Liên quan:** [`Developer_Guide.md`](./Developer_Guide.md) §4–6 · [`Phase1_User_Flows.md`](./Phase1_User_Flows.md) · [`Phase1_Output_Schemas.md`](./Phase1_Output_Schemas.md)

---

## 1. Tổng quan lớp IPC

```
React UI
  │  invoke() / listen()          ← Tauri JS API
  ▼
Rust core  (src-tauri/src/commands/)
  │  HTTP POST/GET loopback       ← FastAPI (localhost:PORT)
  ▼
Python sidecar  (sidecar/arbora_ai/server.py)
  │
  ├── FAISS (vector store, per-subject index file)
  └── Ollama / OpenAI-compat endpoint (LLM + embeddings)
```

**Quy ước:**
- Tauri commands: snake_case, đặt tên theo `<verb>_<noun>` (ví dụ: `create_subject`).
- Sidecar endpoints: REST, JSON body, `Content-Type: application/json`.
- Tất cả ID: `UUID v4` dạng string.
- Thời gian: ISO 8601 UTC string (ví dụ: `"2026-06-24T08:00:00Z"`).
- Mọi command đồng bộ trả kết quả trực tiếp; tác vụ nặng (ingest, generate) trả `job_id` và báo tiến trình qua **Tauri events**.

---

## 2. Shared Types (TypeScript — dùng cho React + sinh từ JSON Schema)

```typescript
// --- Core domain ---

interface Subject {
  id: string;
  name: string;
  color: string;          // hex, ví dụ "#4A7C59"
  created_at: string;
}

interface Source {
  id: string;
  subject_id: string;
  type: "pdf" | "slide" | "audio";
  file_path: string;
  title: string;
  ingested_at: string | null;
  chunk_count: number | null;
}

interface SourceRef {
  source_id: string;
  source_title: string;
  location: { type: "page"; page: number }
           | { type: "timestamp"; timestamp_ms: number };
  excerpt: string;        // đoạn trích dẫn gốc (~1–2 câu)
}

interface Card {
  id: string;
  subject_id: string;
  front: string;
  back: string;
  explanation: string;
  source_ref: SourceRef;
  reviewed: boolean;
}

interface CardSchedule {
  card_id: string;
  due: string;
  stability: number;
  difficulty: number;
  state: "new" | "learning" | "review" | "relearning";
  last_review: string | null;
}

interface QuizItem {
  id: string;
  subject_id: string;
  question: string;
  options: [string, string, string, string];  // A B C D
  answer_index: 0 | 1 | 2 | 3;
  explanation: string;
  source_ref: SourceRef;
  reviewed: boolean;
}

interface Note {
  id: string;
  subject_id: string;
  content: string;        // Markdown
  format: "cornell" | "outline";
  source_refs: SourceRef[];
  reviewed: boolean;
}

interface Deadline {
  id: string;
  subject_id: string;
  title: string;
  due_at: string;
  type: "exam" | "assignment" | "other";
}

interface Grade {
  id: string;
  subject_id: string;
  name: string;
  category: string;       // "midterm", "assignment", "quiz", v.v.
  score: number;
  max_score: number;
  weight: number;         // 0.0 – 1.0
}

// --- Job / async ---

type JobState = "pending" | "running" | "done" | "error";

interface IngestStatus {
  job_id: string;
  source_id: string;
  state: JobState;
  progress: number;       // 0.0 – 1.0
  step: string;           // "parsing" | "transcribing" | "chunking" | "embedding"
  error?: string;
}

interface GenerationStatus {
  job_id: string;
  state: JobState;
  progress: number;
  items_generated: number;
  error?: string;
}

// --- Review ---

type ReviewItem =
  | { type: "card";      item: Card }
  | { type: "quiz_item"; item: QuizItem }
  | { type: "note";      item: Note };

// --- FSRS ---

type FSRSRating = "again" | "hard" | "good" | "easy";

interface NextSchedule {
  card_id: string;
  due: string;
  stability: number;
  difficulty: number;
  state: CardSchedule["state"];
}

// --- Dashboard ---

interface SubjectDashboard {
  subject_id: string;
  total_cards: number;
  mastered_cards: number;     // stability >= ngưỡng cấu hình (mặc định: stability ≥ 21 ngày)
  due_today: number;
  review_streak_days: number; // ngày liên tục có ít nhất 1 card review
  tree_data: TreeData;
  upcoming_deadlines: Deadline[];
}

interface TreeData {
  mastery_pct: number;        // 0.0 – 1.0 → kích thước cây trên UI
  concepts_total: number;
  concepts_mastered: number;
}

// --- Grade summary ---

interface GradeSummary {
  subject_id: string;
  current_weighted_avg: number;   // 0–100
  gpa_estimate: number;           // 0.0 – 4.0, tính từ scale Úc/VN
  what_if: WhatIfEntry[];
}

interface WhatIfEntry {
  scenario: string;               // "Final exam = 80"
  projected_avg: number;
  projected_gpa: number;
}

// --- Settings ---

type AIPreset = "low" | "medium" | "high";   // 🌱 🌿 🌳

interface Settings {
  ai_preset: AIPreset;
  whisper_model: "tiny" | "base" | "small";
  byo_key_enabled: boolean;
  byo_provider: "openai" | "gemini" | "anthropic" | "openrouter" | "custom" | null;
  byo_endpoint: string | null;    // URL cho "custom"
  // byo_api_key KHÔNG lưu ở đây — lưu trong OS keychain
}

// --- Errors ---

type ErrorCode =
  | "SUBJECT_NOT_FOUND"
  | "SOURCE_NOT_FOUND"
  | "CARD_NOT_FOUND"
  | "INGEST_FAILED"
  | "GENERATION_FAILED"
  | "SCHEMA_VALIDATION_FAILED"
  | "SIDECAR_UNAVAILABLE"
  | "LLM_UNAVAILABLE"
  | "PROVIDER_AUTH_FAILED"
  | "EXPORT_FAILED"
  | "DB_ERROR";

interface ArboraError {
  code: ErrorCode;
  message: string;    // thông báo thân thiện cho UI
  details?: unknown;
}
```

> **Ghi chú:** Các types này sẽ được sinh tự động từ `shared/schemas/*.json` khi sang Phase 2; đây là đặc tả để viết schema.

---

## 3. Tauri Commands (React → Rust)

Tất cả gọi qua `invoke(command_name, { payload })`. Lỗi throw `ArboraError`.

### 3.1 Subjects

| Command | Payload | Trả về |
|---|---|---|
| `create_subject` | `{ name: string; color: string }` | `Subject` |
| `list_subjects` | — | `Subject[]` |
| `update_subject` | `{ id: string; name?: string; color?: string }` | `Subject` |
| `delete_subject` | `{ id: string }` | `void` — xóa cascade sources/cards/notes/quiz/deadlines/grades |

### 3.2 Sources & Ingest

| Command | Payload | Trả về |
|---|---|---|
| `add_source` | `{ subject_id: string; file_path: string }` | `Source` — Rust tự detect type từ extension |
| `list_sources` | `{ subject_id: string }` | `Source[]` |
| `delete_source` | `{ id: string }` | `void` — xóa chunks + FAISS vectors |
| `ingest_source` | `{ source_id: string }` | `{ job_id: string }` — bắt đầu async job |
| `get_ingest_status` | `{ job_id: string }` | `IngestStatus` |

> Rust forward request sang sidecar `POST /ingest`, poll/stream tiến trình, emit Tauri events.

### 3.3 Generation & Review

| Command | Payload | Trả về |
|---|---|---|
| `generate_content` | `{ subject_id: string; source_ids: string[]; types: Array<"notes"\|"cards"\|"quiz"> }` | `{ job_id: string }` |
| `get_generation_status` | `{ job_id: string }` | `GenerationStatus` |
| `get_review_queue` | `{ subject_id: string }` | `ReviewItem[]` — chỉ item chưa review |
| `approve_card` | `{ card_id: string; edits?: Partial<Pick<Card,"front"\|"back"\|"explanation">> }` | `void` |
| `reject_card` | `{ card_id: string }` | `void` — xóa khỏi DB |
| `approve_quiz_item` | `{ item_id: string; edits?: Partial<Pick<QuizItem,"question"\|"options"\|"answer_index"\|"explanation">> }` | `void` |
| `reject_quiz_item` | `{ item_id: string }` | `void` |
| `approve_note` | `{ note_id: string; edits?: { content?: string } }` | `void` |
| `reject_note` | `{ note_id: string }` | `void` |
| `bulk_review` | `{ decisions: Array<{ type: "card"\|"quiz_item"\|"note"; id: string; action: "approve"\|"reject"; edits?: object }> }` | `void` — "Approve all" |

### 3.4 Study (FSRS)

| Command | Payload | Trả về |
|---|---|---|
| `get_due_cards` | `{ subject_id: string; limit?: number }` | `Array<{ card: Card; schedule: CardSchedule }>` |
| `submit_card_review` | `{ card_id: string; rating: FSRSRating }` | `NextSchedule` |
| `get_study_stats` | `{ subject_id: string }` | `{ due_today: number; due_this_week: number; mastered: number; streak: number }` |

### 3.5 Planning (Deadlines + Grades)

| Command | Payload | Trả về |
|---|---|---|
| `create_deadline` | `{ subject_id: string; title: string; due_at: string; type: Deadline["type"] }` | `Deadline` |
| `list_deadlines` | `{ subject_id: string }` | `Deadline[]` — sorted by due_at |
| `update_deadline` | `{ id: string; title?: string; due_at?: string; type?: Deadline["type"] }` | `Deadline` |
| `delete_deadline` | `{ id: string }` | `void` |
| `add_grade` | `{ subject_id: string; name: string; category: string; score: number; max_score: number; weight: number }` | `Grade` |
| `list_grades` | `{ subject_id: string }` | `Grade[]` |
| `update_grade` | `{ id: string; score?: number; max_score?: number; weight?: number }` | `Grade` |
| `delete_grade` | `{ id: string }` | `void` |
| `get_grade_summary` | `{ subject_id: string }` | `GradeSummary` |

### 3.6 Dashboard

| Command | Payload | Trả về |
|---|---|---|
| `get_subject_dashboard` | `{ subject_id: string }` | `SubjectDashboard` |

### 3.7 Export & Settings

| Command | Payload | Trả về |
|---|---|---|
| `export_apkg` | `{ subject_id: string }` | `{ file_path: string }` — path file .apkg đã tạo |
| `get_settings` | — | `Settings` |
| `update_settings` | `Partial<Settings> & { byo_api_key?: string }` | `Settings` — `byo_api_key` đi thẳng vào OS keychain, không vào DB |

---

## 4. Tauri Events (Rust → React)

React đăng ký bằng `listen(event_name, handler)`.

| Event | Payload | Khi nào |
|---|---|---|
| `ingest:progress` | `{ source_id: string; job_id: string; progress: number; step: string }` | Trong quá trình ingest |
| `ingest:done` | `{ source_id: string; job_id: string; chunk_count: number }` | Ingest hoàn tất |
| `ingest:error` | `{ source_id: string; job_id: string; error: string }` | Ingest thất bại |
| `generate:progress` | `{ job_id: string; progress: number; items_generated: number }` | Trong quá trình gen |
| `generate:done` | `{ job_id: string; items_generated: number }` | Gen hoàn tất |
| `generate:error` | `{ job_id: string; error: string }` | Gen thất bại |
| `sidecar:status` | `{ state: "starting"\|"ready"\|"crashed"; error?: string }` | Vòng đời sidecar |

---

## 5. Sidecar HTTP API (Rust → Python, loopback)

**Base URL:** `http://127.0.0.1:{PORT}` (cổng chọn ngẫu nhiên khi khởi động, Rust đọc từ stdout sidecar).

Tất cả request/response `Content-Type: application/json`.

### 5.1 Health

```
GET /health
→ 200 { "status": "ok", "model_loaded": bool, "whisper_loaded": bool }
→ 503 { "status": "starting" }
```

### 5.2 Ingest

```
POST /ingest
body: {
  "job_id":    "uuid",
  "source_id": "uuid",
  "subject_id":"uuid",
  "file_path": "/abs/path/to/file.pdf",
  "type":      "pdf" | "slide" | "audio"
}
→ 202 { "job_id": "uuid" }
→ 400 { "error": "unsupported_type" }

GET /ingest/{job_id}/status
→ 200 IngestStatusSidecar {
    "job_id":   "uuid",
    "state":    "pending"|"running"|"done"|"error",
    "progress": 0.0–1.0,
    "step":     "parsing"|"transcribing"|"chunking"|"embedding",
    "chunk_count": int|null,
    "error":    str|null
  }
```

> Khi `state = "done"`: Rust đọc chunk_count, lưu `chunks` vào SQLite, update `sources.ingested_at`.

### 5.3 Generate

```
POST /generate
body: {
  "job_id":     "uuid",
  "subject_id": "uuid",
  "source_ids": ["uuid", ...],
  "types":      ["notes", "cards", "quiz"],   // ít nhất 1
  "llm_config": {
    "provider": "ollama" | "openai_compat",
    "model":    "qwen2.5:3b",                 // tên model Ollama hoặc remote
    "endpoint": "http://localhost:11434",     // chỉ dùng khi provider=openai_compat
    "api_key":  "sk-..."                      // chỉ khi cần, lấy từ Rust keychain
  }
}
→ 202 { "job_id": "uuid" }

GET /generate/{job_id}/status
→ 200 {
    "job_id":          "uuid",
    "state":           "pending"|"running"|"done"|"error",
    "progress":        0.0–1.0,
    "items_generated": int,
    "error":           str|null
  }

GET /generate/{job_id}/result
→ 200 {
    "notes":      [NoteOut],
    "cards":      [CardOut],
    "quiz_items": [QuizItemOut]
  }
```

> `NoteOut`, `CardOut`, `QuizItemOut` — xem §6 bên dưới (Output Schemas).
> Khi `state = "done"`: Rust gọi `/generate/{job_id}/result`, lưu items vào SQLite với `reviewed = false`.

---

## 6. Output Schemas (Pydantic — Python sidecar, trả về trong `/generate` result)

> Chi tiết schema với GBNF/structured output ở [`Phase1_Output_Schemas.md`](./Phase1_Output_Schemas.md). Đây là shape tóm tắt mà Rust expect.

```python
class SourceRefOut(BaseModel):
    source_id: str
    location: dict          # {"type": "page", "page": 3} | {"type": "timestamp", "timestamp_ms": 12300}
    excerpt: str            # ≤200 ký tự, trích nguyên văn từ nguồn

class CardOut(BaseModel):
    front: str              # câu hỏi / khái niệm
    back: str               # câu trả lời
    explanation: str        # giải thích tại sao (≤150 từ)
    source_ref: SourceRefOut

class QuizItemOut(BaseModel):
    question: str
    options: list[str]      # đúng 4 phần tử
    answer_index: int       # 0–3
    explanation: str
    source_ref: SourceRefOut

class NoteOut(BaseModel):
    content: str            # Markdown Cornell / outline
    format: Literal["cornell", "outline"]
    source_refs: list[SourceRefOut]  # ≥1

class GenerationResult(BaseModel):
    notes:      list[NoteOut]
    cards:      list[CardOut]
    quiz_items: list[QuizItemOut]
```

**Ràng buộc bất di bất dịch:**
- `source_ref.excerpt` phải là substring thực của chunk nguồn (Rust verify sau khi nhận).
- `answer_index` phải nằm trong `[0, len(options)-1]`.
- `source_refs` không được rỗng với `NoteOut`.
- Schema sai → Python retry (tối đa 3 lần với temperature 0) → nếu vẫn sai → báo lỗi item cụ thể, không drop toàn batch.

---

## 7. LLM Provider Interface (Python)

File: `sidecar/arbora_ai/llm/provider.py`

```python
from abc import ABC, abstractmethod
from typing import Any

class LLMProvider(ABC):
    """Abstraction duy nhất mà generate/* được phép gọi. Lõi không biết provider nào đứng sau."""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        schema: dict,           # JSON Schema để ràng buộc output
        temperature: float = 0.1,
        max_tokens: int = 2048,
    ) -> dict:
        """Gọi LLM, parse JSON, validate theo schema, trả dict hợp lệ.
        Raises: LLMSchemaError nếu sau max_retries vẫn sai schema.
                LLMUnavailableError nếu không kết nối được model.
        """
        ...

    @abstractmethod
    async def health(self) -> bool:
        """True nếu model sẵn sàng nhận request."""
        ...


class OllamaProvider(LLMProvider):
    """Local Ollama via /api/generate với structured output (GBNF hoặc format:json)."""

    def __init__(self, model: str, endpoint: str = "http://localhost:11434"):
        ...

class OpenAICompatProvider(LLMProvider):
    """Endpoint OpenAI-compatible (OpenAI/Gemini/Anthropic/OpenRouter/custom).
    Dữ liệu rời máy — CHỈ khởi tạo khi user bật byo_key_enabled."""

    def __init__(self, model: str, endpoint: str, api_key: str):
        ...
```

**Nguyên tắc:**
- `generate/` và `rag/` chỉ import `LLMProvider` (interface), không bao giờ import `OllamaProvider` hay `OpenAICompatProvider` trực tiếp.
- Factory function `get_provider(config: LLMConfig) -> LLMProvider` ở `llm/provider.py` là nơi duy nhất biết provider cụ thể.
- Code online (`OpenAICompatProvider`) trong module riêng, có comment `# ONLINE — data leaves device`.

---

## 8. Error Handling Conventions

**Tauri commands:**
- Rust trả `Err(ArboraError)` → Tauri serialise thành `{ code, message, details }` → React `catch`.
- UI map `ErrorCode` sang thông báo tiếng Việt thân thiện.
- Lỗi `SIDECAR_UNAVAILABLE`: Rust tự restart sidecar (tối đa 3 lần), chỉ báo UI sau 3 lần thất bại.

**Sidecar HTTP:**
- HTTP 4xx: lỗi input (bad request, not found).
- HTTP 5xx: lỗi xử lý (model crash, schema retry hết lần).
- Rust không expose HTTP errors trực tiếp ra UI — wrap thành `ArboraError` với code phù hợp.

**Structured output retry:**
```python
MAX_RETRIES = 3
RETRY_TEMPERATURE_INCREMENT = 0.05   # tăng nhẹ mỗi lần để phá loop

for attempt in range(MAX_RETRIES):
    raw = await provider.generate(prompt, schema, temperature + attempt * RETRY_TEMPERATURE_INCREMENT)
    if valid(raw, schema):
        return raw
raise LLMSchemaError(f"Schema validation failed after {MAX_RETRIES} attempts")
```

---

*IPC Contract v1.0 — Phase 1 Design. Chưa code. Sinh types và Pydantic models từ đây khi sang Phase 2 (Skeleton).*
