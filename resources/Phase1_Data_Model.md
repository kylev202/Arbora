# Arbora — Data Model (Phase 1)

> **Mục đích:** Formal hóa mô hình dữ liệu (Developer Guide §6) thành SQL DDL cụ thể cho SQLite — nền tảng cho migration đầu tiên ở Phase 2. Bao gồm bảng, khóa, index, ràng buộc, và ánh xạ FAISS.
> **Trạng thái:** v1 — Phase 1 Design. Chưa code. Migration thực tế đánh số ở `src-tauri/src/db/migrations/`.
> **Liên quan:** [`Developer_Guide.md`](./Developer_Guide.md) §6 · [`Phase1_IPC_Contract.md`](./Phase1_IPC_Contract.md) §2 · [`Phase1_Output_Schemas.md`](./Phase1_Output_Schemas.md)

---

## 1. Nguyên tắc

- **Engine:** SQLite qua `sqlx` (Rust). `PRAGMA foreign_keys = ON`.
- **ID:** `TEXT` chứa UUID v4 (sinh ở Rust). Không dùng autoincrement integer để dễ merge/sync sau này.
- **Thời gian:** `TEXT` ISO 8601 UTC (`strftime` hoặc set từ Rust). SQLite không có kiểu datetime riêng.
- **Boolean:** `INTEGER` 0/1.
- **Cascade:** xóa subject → cascade toàn bộ dữ liệu con (`ON DELETE CASCADE`).
- **FAISS:** vectors KHÔNG nằm trong SQLite. SQLite giữ `faiss_id` (INTEGER) để ánh xạ ngược chunk ↔ vector.

---

## 2. Sơ đồ quan hệ (ERD text)

```
subjects (1) ──┬──< sources (1) ──< chunks ──[faiss_id]──► FAISS index (per subject)
               ├──< notes
               ├──< cards (1) ──── card_schedule (1:1)
               ├──< quizzes (1) ──< quiz_items
               ├──< deadlines
               ├──< study_sessions
               ├──< grades
               └──< concepts            (Pha 2, nhưng tạo bảng từ MVP để cây dùng)

settings (singleton, không khóa ngoại)
```

---

## 3. DDL

### 3.1 subjects

```sql
CREATE TABLE subjects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#4A7C59',   -- hex
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
```

### 3.2 sources

```sql
CREATE TABLE sources (
    id           TEXT PRIMARY KEY,
    subject_id   TEXT NOT NULL,
    type         TEXT NOT NULL CHECK (type IN ('pdf','slide','audio')),
    file_path    TEXT NOT NULL,
    title        TEXT NOT NULL,
    page_count   INTEGER,                  -- null cho audio
    duration_ms  INTEGER,                  -- null cho pdf/slide
    ingested_at  TEXT,                     -- null = chưa ingest
    chunk_count  INTEGER,
    created_at   TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_sources_subject ON sources(subject_id);
```

### 3.3 chunks

```sql
CREATE TABLE chunks (
    id            TEXT PRIMARY KEY,
    source_id     TEXT NOT NULL,
    subject_id    TEXT NOT NULL,           -- denormalize để query RAG theo môn nhanh
    text          TEXT NOT NULL,
    -- vị trí citation: PDF/slide dùng page; audio dùng timestamp
    page          INTEGER,
    timestamp_ms  INTEGER,
    faiss_id      INTEGER NOT NULL,        -- id trong FAISS index của subject
    chunk_index   INTEGER NOT NULL,        -- thứ tự trong source
    FOREIGN KEY (source_id)  REFERENCES sources(id)  ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_chunks_source  ON chunks(source_id);
CREATE INDEX idx_chunks_subject ON chunks(subject_id);
CREATE UNIQUE INDEX idx_chunks_faiss ON chunks(subject_id, faiss_id);
```

> **Ánh xạ FAISS:** mỗi subject có một index file `faiss/{subject_id}.index`. `faiss_id` là vị trí vector trong index đó. Khi RAG trả top-k `faiss_id` → JOIN ngược `chunks` để lấy text + citation. Xóa chunk → cần rebuild index (FAISS không xóa tại chỗ với IndexFlat; chấp nhận rebuild ở MVP).

### 3.4 notes

```sql
CREATE TABLE notes (
    id          TEXT PRIMARY KEY,
    subject_id  TEXT NOT NULL,
    content     TEXT NOT NULL,                       -- Markdown
    format      TEXT NOT NULL CHECK (format IN ('cornell','outline')),
    reviewed    INTEGER NOT NULL DEFAULT 0,          -- review-before-trust gate
    created_at  TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_notes_subject ON notes(subject_id);

-- citation nhiều-nhiều cho note (một note trỏ ≥1 chunk)
CREATE TABLE note_source_refs (
    id           TEXT PRIMARY KEY,
    note_id      TEXT NOT NULL,
    source_id    TEXT NOT NULL,
    page         INTEGER,
    timestamp_ms INTEGER,
    excerpt      TEXT NOT NULL,
    FOREIGN KEY (note_id)   REFERENCES notes(id)    ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES sources(id)  ON DELETE CASCADE
);
CREATE INDEX idx_note_refs_note ON note_source_refs(note_id);
```

### 3.5 cards + card_schedule

```sql
CREATE TABLE cards (
    id            TEXT PRIMARY KEY,
    subject_id    TEXT NOT NULL,
    front         TEXT NOT NULL,
    back          TEXT NOT NULL,
    explanation   TEXT NOT NULL DEFAULT '',
    -- citation (một card = một nguồn)
    source_id     TEXT NOT NULL,
    page          INTEGER,
    timestamp_ms  INTEGER,
    excerpt       TEXT NOT NULL,
    reviewed      INTEGER NOT NULL DEFAULT 0,         -- chỉ reviewed=1 mới vào lịch FSRS
    created_at    TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id)  REFERENCES sources(id)  ON DELETE CASCADE
);
CREATE INDEX idx_cards_subject  ON cards(subject_id);
CREATE INDEX idx_cards_reviewed ON cards(subject_id, reviewed);

-- FSRS state — chỉ tạo row khi card được approve (reviewed=1)
CREATE TABLE card_schedule (
    card_id      TEXT PRIMARY KEY,
    due          TEXT NOT NULL,                       -- ISO datetime
    stability    REAL NOT NULL,
    difficulty   REAL NOT NULL,
    state        TEXT NOT NULL CHECK (state IN ('new','learning','review','relearning')),
    reps         INTEGER NOT NULL DEFAULT 0,
    lapses       INTEGER NOT NULL DEFAULT 0,
    last_review  TEXT,
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);
CREATE INDEX idx_schedule_due ON card_schedule(due);
```

### 3.6 quizzes + quiz_items

```sql
CREATE TABLE quizzes (
    id          TEXT PRIMARY KEY,
    subject_id  TEXT NOT NULL,
    title       TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_quizzes_subject ON quizzes(subject_id);

CREATE TABLE quiz_items (
    id            TEXT PRIMARY KEY,
    quiz_id       TEXT NOT NULL,
    subject_id    TEXT NOT NULL,                      -- denormalize cho review queue
    question      TEXT NOT NULL,
    options_json  TEXT NOT NULL,                      -- JSON array 4 string
    answer_index  INTEGER NOT NULL CHECK (answer_index BETWEEN 0 AND 3),
    explanation   TEXT NOT NULL DEFAULT '',
    source_id     TEXT NOT NULL,
    page          INTEGER,
    timestamp_ms  INTEGER,
    excerpt       TEXT NOT NULL,
    reviewed      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    FOREIGN KEY (quiz_id)    REFERENCES quizzes(id)  ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id)  REFERENCES sources(id)  ON DELETE CASCADE
);
CREATE INDEX idx_quiz_items_quiz     ON quiz_items(quiz_id);
CREATE INDEX idx_quiz_items_reviewed ON quiz_items(subject_id, reviewed);
```

### 3.7 deadlines

```sql
CREATE TABLE deadlines (
    id          TEXT PRIMARY KEY,
    subject_id  TEXT NOT NULL,
    title       TEXT NOT NULL,
    due_at      TEXT NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('exam','assignment','other')),
    created_at  TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_deadlines_subject ON deadlines(subject_id, due_at);
```

### 3.8 study_sessions

```sql
-- Lịch sử phiên ôn (audit + stats streak). Pha 3 sẽ tự rải; MVP chỉ ghi nhận.
CREATE TABLE study_sessions (
    id           TEXT PRIMARY KEY,
    subject_id   TEXT NOT NULL,
    started_at   TEXT NOT NULL,
    ended_at     TEXT,
    cards_reviewed INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_sessions_subject ON study_sessions(subject_id, started_at);
```

### 3.9 grades

```sql
CREATE TABLE grades (
    id          TEXT PRIMARY KEY,
    subject_id  TEXT NOT NULL,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL,
    score       REAL,                                 -- null = chưa có điểm (cho what-if)
    max_score   REAL NOT NULL DEFAULT 100,
    weight      REAL NOT NULL DEFAULT 0,              -- 0.0–1.0
    created_at  TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_grades_subject ON grades(subject_id);
```

### 3.10 concepts (tạo từ MVP, populate sâu ở Pha 2)

```sql
-- Knowledge map / dữ liệu nuôi "cây". MVP: dùng card mastery làm proxy;
-- bảng này cho phép Pha 2 gắn concept → cards mà không cần migration phá vỡ.
CREATE TABLE concepts (
    id            TEXT PRIMARY KEY,
    subject_id    TEXT NOT NULL,
    name          TEXT NOT NULL,
    mastery_state TEXT NOT NULL DEFAULT 'new'
                  CHECK (mastery_state IN ('new','learning','mastered','needs_review')),
    created_at    TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);
CREATE INDEX idx_concepts_subject ON concepts(subject_id);

-- liên kết concept ↔ card (Pha 2)
CREATE TABLE concept_cards (
    concept_id TEXT NOT NULL,
    card_id    TEXT NOT NULL,
    PRIMARY KEY (concept_id, card_id),
    FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE,
    FOREIGN KEY (card_id)    REFERENCES cards(id)    ON DELETE CASCADE
);
```

### 3.11 settings (singleton)

```sql
CREATE TABLE settings (
    id              INTEGER PRIMARY KEY CHECK (id = 1),   -- chỉ 1 row
    ai_preset       TEXT NOT NULL DEFAULT 'medium'
                    CHECK (ai_preset IN ('low','medium','high')),
    whisper_model   TEXT NOT NULL DEFAULT 'base'
                    CHECK (whisper_model IN ('tiny','base','small')),
    byo_key_enabled INTEGER NOT NULL DEFAULT 0,
    byo_provider    TEXT,
    byo_endpoint    TEXT,
    -- byo_api_key KHÔNG ở đây — lưu trong OS keychain (Tauri stronghold / keyring)
    onboarded       INTEGER NOT NULL DEFAULT 0,
    updated_at      TEXT NOT NULL
);
INSERT INTO settings (id, updated_at) VALUES (1, strftime('%Y-%m-%dT%H:%M:%SZ','now'));
```

---

## 4. Truy vấn quan trọng (định nghĩa trước để index đúng)

```sql
-- Review queue: items chưa duyệt của một môn
SELECT * FROM cards      WHERE subject_id = ? AND reviewed = 0;
SELECT * FROM quiz_items WHERE subject_id = ? AND reviewed = 0;
SELECT * FROM notes      WHERE subject_id = ? AND reviewed = 0;

-- Thẻ due hôm nay (FSRS) — chỉ card đã approve có card_schedule
SELECT c.*, s.due, s.stability, s.state
FROM cards c JOIN card_schedule s ON s.card_id = c.id
WHERE c.subject_id = ? AND s.due <= ?     -- ? = now
ORDER BY s.due ASC LIMIT ?;

-- Dashboard: mastery count (card "đã thuộc" = stability >= ngưỡng)
SELECT
  COUNT(*)                                    AS total,
  SUM(CASE WHEN s.stability >= 21 THEN 1 ELSE 0 END) AS mastered,
  SUM(CASE WHEN s.due <= ? THEN 1 ELSE 0 END)        AS due_today
FROM cards c JOIN card_schedule s ON s.card_id = c.id
WHERE c.subject_id = ?;

-- Grade summary: trung bình có trọng số (chỉ tính điểm đã có)
SELECT SUM((score/max_score) * weight) / SUM(weight) AS weighted_avg
FROM grades WHERE subject_id = ? AND score IS NOT NULL;
```

---

## 5. Quyết định thiết kế & lý do

| Quyết định | Lý do |
|---|---|
| UUID text thay vì autoincrement | Tránh xung đột nếu sau này có sync/merge nhiều thiết bị; dễ generate ở Rust trước khi insert. |
| Citation inline trên card/quiz, bảng riêng cho note | Card/quiz = 1 nguồn → inline đơn giản; note = nhiều nguồn → cần bảng `note_source_refs`. |
| `card_schedule` tách khỏi `cards` | FSRS state chỉ tồn tại sau approve; tách giúp query due nhanh + gate review-before-trust rõ ràng (card chưa approve không có schedule). |
| `concepts` tạo sớm dù Pha 2 mới dùng | Tránh migration phá vỡ; MVP cây dùng card mastery làm proxy, Pha 2 nối concept không cần đổi schema cũ. |
| `options_json` thay vì bảng `quiz_options` | 4 option cố định, không query riêng từng option → JSON đơn giản hơn, đúng altitude MVP. |
| FAISS ngoài SQLite | FAISS là vector engine chuyên dụng; SQLite chỉ giữ ánh xạ id → text + citation. |
| `score` nullable trong grades | Cho phép nhập "thi cuối kỳ" trước khi có điểm → what-if GPA tính trên ô trống. |
| `settings` singleton (id=1) | Cấu hình app cấp máy, không per-subject; CHECK ép đúng 1 row. |

---

## 6. Migration plan (Phase 2)

```
migrations/
├── 0001_initial.sql          # toàn bộ DDL §3
├── 0002_...                   # (tương lai)
```

- Migration chạy ở Rust khi app khởi động (`sqlx::migrate!`).
- Mỗi migration idempotent + forward-only ở MVP (chưa cần down-migration).

---

*Data Model v1.0 — Phase 1 Design. DDL là bản thiết kế; migration `0001_initial.sql` viết ở Phase 2 (Skeleton).*
