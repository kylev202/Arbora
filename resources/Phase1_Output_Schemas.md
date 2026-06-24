# Arbora — Structured Output Schemas (Phase 1)

> **Mục đích:** Đặc tả schema cho output AI (notes/flashcard/quiz) ở tầng Pydantic, JSON Schema, và GBNF grammar. Đây là cơ chế thực thi **3 luật bất di bất dịch**: grounding, citation, structured output. Sai schema → reject + retry.
> **Trạng thái:** v1 — Phase 1 Design. Chưa code.
> **Liên quan:** [`Phase1_IPC_Contract.md`](./Phase1_IPC_Contract.md) §6–7 · [`Developer_Guide.md`](./Developer_Guide.md) §2, §7 · [`Requirements.md`](./Requirements.md) FR-GEN-2/3/4, NFR-SAFE-1

---

## 1. Nguyên tắc nền

| Luật | Cơ chế thực thi |
|---|---|
| **Grounding** | Mọi item phải có `source_ref`; `excerpt` phải là substring thực của chunk nguồn (verify sau LLM). |
| **Citation first-class** | Schema *bắt buộc* `source_ref` — không có field nào optional liên quan citation. |
| **Structured output** | LLM bị ràng buộc bằng GBNF grammar (Ollama) hoặc JSON mode (OpenAI-compat) → parse → validate Pydantic → retry. |
| **Determinism** | `temperature=0.1`, seed cố định khi cần reproducibility cho test. |

**Pipeline validate:**
```
LLM output (raw text)
  → parse JSON                    [fail → retry]
  → Pydantic validate structure   [fail → retry]
  → semantic checks (xem §5)      [fail → drop item, log, không retry toàn batch]
  → return GenerationResult
```

---

## 2. Pydantic Models (nguồn chân lý Python)

File: `sidecar/arbora_ai/schemas/output.py`

```python
from pydantic import BaseModel, Field, field_validator
from typing import Literal


# ─── Citation (dùng chung) ──────────────────────────────────

class PageLocation(BaseModel):
    type: Literal["page"]
    page: int = Field(ge=1)

class TimestampLocation(BaseModel):
    type: Literal["timestamp"]
    timestamp_ms: int = Field(ge=0)

class SourceRef(BaseModel):
    source_id: str
    location: PageLocation | TimestampLocation
    excerpt: str = Field(min_length=1, max_length=200)
    # excerpt phải khớp (sau normalize) với text của chunk nguồn — verify ở §5


# ─── Flashcard ──────────────────────────────────────────────

class CardOut(BaseModel):
    front: str = Field(min_length=3, max_length=300)
    back: str = Field(min_length=1, max_length=500)
    explanation: str = Field(max_length=600)        # ≤ ~150 từ
    source_ref: SourceRef

    @field_validator("front")
    @classmethod
    def front_is_question_or_concept(cls, v: str) -> str:
        # Cấm front rỗng nghĩa hoặc lặp lại y nguyên back (kiểm tra ở §5)
        return v.strip()


# ─── Quiz (trắc nghiệm) ─────────────────────────────────────

class QuizItemOut(BaseModel):
    question: str = Field(min_length=5, max_length=400)
    options: list[str] = Field(min_length=4, max_length=4)   # đúng 4 lựa chọn
    answer_index: int = Field(ge=0, le=3)
    explanation: str = Field(max_length=600)
    source_ref: SourceRef

    @field_validator("options")
    @classmethod
    def options_distinct_nonempty(cls, v: list[str]) -> list[str]:
        cleaned = [o.strip() for o in v]
        if any(not o for o in cleaned):
            raise ValueError("options không được rỗng")
        if len(set(cleaned)) != 4:
            raise ValueError("4 lựa chọn phải khác nhau")
        return cleaned


# ─── Notes (Cornell / outline) ──────────────────────────────

class NoteOut(BaseModel):
    content: str = Field(min_length=20)             # Markdown
    format: Literal["cornell", "outline"]
    source_refs: list[SourceRef] = Field(min_length=1)


# ─── Kết quả tổng ───────────────────────────────────────────

class GenerationResult(BaseModel):
    notes: list[NoteOut] = Field(default_factory=list)
    cards: list[CardOut] = Field(default_factory=list)
    quiz_items: list[QuizItemOut] = Field(default_factory=list)
```

---

## 3. JSON Schema (shared/schemas/ — sinh TS types từ đây)

> Pydantic xuất JSON Schema qua `.model_json_schema()`. Bản dưới là dạng đã làm phẳng để dùng làm hợp đồng 3 lớp và ràng buộc LLM (JSON mode).

### 3.1 `card.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CardOut",
  "type": "object",
  "additionalProperties": false,
  "required": ["front", "back", "explanation", "source_ref"],
  "properties": {
    "front":       { "type": "string", "minLength": 3,  "maxLength": 300 },
    "back":        { "type": "string", "minLength": 1,  "maxLength": 500 },
    "explanation": { "type": "string", "maxLength": 600 },
    "source_ref":  { "$ref": "#/$defs/sourceRef" }
  },
  "$defs": {
    "sourceRef": {
      "type": "object",
      "additionalProperties": false,
      "required": ["source_id", "location", "excerpt"],
      "properties": {
        "source_id": { "type": "string" },
        "excerpt":   { "type": "string", "minLength": 1, "maxLength": 200 },
        "location": {
          "oneOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "required": ["type", "page"],
              "properties": {
                "type": { "const": "page" },
                "page": { "type": "integer", "minimum": 1 }
              }
            },
            {
              "type": "object",
              "additionalProperties": false,
              "required": ["type", "timestamp_ms"],
              "properties": {
                "type":         { "const": "timestamp" },
                "timestamp_ms": { "type": "integer", "minimum": 0 }
              }
            }
          ]
        }
      }
    }
  }
}
```

### 3.2 `quiz_item.schema.json` (rút gọn — `source_ref` dùng chung `$ref`)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "QuizItemOut",
  "type": "object",
  "additionalProperties": false,
  "required": ["question", "options", "answer_index", "explanation", "source_ref"],
  "properties": {
    "question":     { "type": "string", "minLength": 5, "maxLength": 400 },
    "options": {
      "type": "array", "minItems": 4, "maxItems": 4,
      "items": { "type": "string", "minLength": 1 }
    },
    "answer_index": { "type": "integer", "minimum": 0, "maximum": 3 },
    "explanation":  { "type": "string", "maxLength": 600 },
    "source_ref":   { "$ref": "sourceRef.schema.json" }
  }
}
```

### 3.3 `note.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "NoteOut",
  "type": "object",
  "additionalProperties": false,
  "required": ["content", "format", "source_refs"],
  "properties": {
    "content": { "type": "string", "minLength": 20 },
    "format":  { "enum": ["cornell", "outline"] },
    "source_refs": {
      "type": "array", "minItems": 1,
      "items": { "$ref": "sourceRef.schema.json" }
    }
  }
}
```

> **Ghi chú:** Để JSON mode chặt hơn, batch generate sinh **một item một lần** (không sinh cả mảng) — giảm khả năng LLM nhỏ trượt schema; Python gom thành mảng. Mỗi prompt yêu cầu đúng một object.

---

## 4. GBNF Grammar (Ollama / llama.cpp — ràng buộc cứng)

> GBNF ép LLM chỉ sinh token hợp lệ theo grammar — mạnh hơn JSON mode với model nhỏ. Một grammar per loại output. Đây là grammar cho **một CardOut**.

File: `sidecar/arbora_ai/llm/grammars/card.gbnf`

```gbnf
root         ::= "{" ws
                 "\"front\":" ws string ws "," ws
                 "\"back\":" ws string ws "," ws
                 "\"explanation\":" ws string ws "," ws
                 "\"source_ref\":" ws sourceref ws
                 "}"

sourceref    ::= "{" ws
                 "\"source_id\":" ws string ws "," ws
                 "\"location\":" ws location ws "," ws
                 "\"excerpt\":" ws string ws
                 "}"

location     ::= pageloc | tsloc
pageloc      ::= "{" ws "\"type\":" ws "\"page\"" ws "," ws "\"page\":" ws posint ws "}"
tsloc        ::= "{" ws "\"type\":" ws "\"timestamp\"" ws "," ws "\"timestamp_ms\":" ws posint ws "}"

string       ::= "\"" char* "\""
char         ::= [^"\\] | "\\" (["\\/bfnrt] | "u" hex hex hex hex)
hex          ::= [0-9a-fA-F]
posint       ::= [1-9] [0-9]*
ws           ::= [ \t\n]*
```

> Grammar cho `quiz.gbnf` thêm `options` (array đúng 4 string) + `answer_index` (digit 0–3). Grammar cho `note.gbnf` thêm `format` (enum) + `source_refs` (array ≥1). Các grammar này sinh từ JSON Schema bằng script ở Phase 2 (`scripts/schema_to_gbnf.py`).

---

## 5. Semantic Checks (sau Pydantic — luật grounding thực thi)

Pydantic chỉ kiểm cấu trúc. Các check ngữ nghĩa này thực thi **grounding thật**, chạy ở Python sau khi parse, trước khi trả về Rust:

| Check | Quy tắc | Vi phạm → |
|---|---|---|
| **Excerpt grounding** | `source_ref.excerpt` (sau normalize: lowercase, bỏ khoảng trắng thừa) phải là substring của chunk text gốc | Drop item, log `grounding_failed` |
| **Source ID hợp lệ** | `source_id` phải thuộc danh sách `source_ids` của request | Drop item |
| **Location khớp loại** | PDF/slide → `page`; audio → `timestamp` | Drop item |
| **Page trong phạm vi** | `page ≤ tổng số trang của source` | Drop item |
| **Front ≠ Back** | (card) `front` không trùng `back` (tránh thẻ vô nghĩa) | Drop item |
| **Answer index hợp lệ** | (quiz) `0 ≤ answer_index ≤ 3` và trỏ tới option không rỗng | Drop item |
| **Không trùng lặp** | Dedupe card có `front` gần giống (normalized) trong cùng batch | Giữ 1, drop phần còn lại |

```python
def verify_grounding(item: CardOut, chunks: dict[str, Chunk]) -> bool:
    chunk = chunks.get((item.source_ref.source_id, _chunk_key(item.source_ref.location)))
    if chunk is None:
        return False
    return _normalize(item.source_ref.excerpt) in _normalize(chunk.text)

def _normalize(s: str) -> str:
    return " ".join(s.lower().split())
```

> **Triết lý:** thà sinh ít item mà chắc grounded còn hơn nhiều item bịa. Drop item lỗi nhưng KHÔNG fail toàn batch — báo về UI "X items bị loại do không truy được nguồn".

---

## 6. Retry Policy

```python
MAX_STRUCTURE_RETRIES = 3        # cho lỗi parse/Pydantic
# Lỗi semantic (grounding) KHÔNG retry — drop item luôn (LLM nhỏ retry thường vẫn bịa)

async def generate_one(prompt: str, schema: dict, provider: LLMProvider, ItemModel):
    last_err = None
    for attempt in range(MAX_STRUCTURE_RETRIES):
        try:
            raw = await provider.generate(
                prompt, schema,
                temperature=0.1 + attempt * 0.05,   # nhích nhẹ để phá loop lặp
            )
            return ItemModel.model_validate(raw)     # Pydantic structure check
        except (json.JSONDecodeError, ValidationError) as e:
            last_err = e
            continue
    raise LLMSchemaError(f"Structure invalid after {MAX_STRUCTURE_RETRIES}: {last_err}")
```

---

## 7. Prompt Contract (tóm tắt — chi tiết few-shot ở Phase 2)

Mỗi prompt tới LLM gồm:

```
[SYSTEM]
Bạn tạo {flashcard|quiz|note} CHỈ từ đoạn văn bản được cung cấp.
TUYỆT ĐỐI không thêm kiến thức ngoài đoạn này.
Mỗi item phải trích dẫn chính xác đoạn nguồn (excerpt nguyên văn).
Trả về đúng một object JSON theo schema. Không giải thích thêm.

[CONTEXT]
source_id: {id}
location: {page N | timestamp}
---
{chunk_text}
---

[FEW-SHOT]
{1–2 ví dụ mẫu đúng định dạng}

[TASK]
Tạo một {item} từ đoạn trên.
```

**Ràng buộc prompt:**
- Mỗi lần gọi gắn đúng **một chunk** → đảm bảo `source_ref` trỏ đúng, dễ verify grounding.
- `excerpt` được yêu cầu copy nguyên văn từ chunk → semantic check ở §5 pass tự nhiên.

---

*Output Schemas v1.0 — Phase 1 Design. Pydantic là nguồn chân lý; JSON Schema sinh TS types; GBNF ràng buộc model local. Sang Phase 2: viết script schema→GBNF + few-shot prompts.*
