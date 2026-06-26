/**
 * Shared domain types — the data shapes the UI renders.
 *
 * Mirror of the "IPC Contract" + "Output Schemas" (resources/vault). The Rust
 * core returns exactly these shapes over `src/lib/ipc.ts`, so components render
 * them directly.
 */

export type AIPreset = "low" | "medium" | "high"; // 🌱 🌿 🌳
export type WhisperModel = "tiny" | "base" | "small";
export type FSRSRating = "again" | "hard" | "good" | "easy";
export type JobState = "pending" | "running" | "done" | "error";

/** Device/AI prefs persisted in the DB settings singleton. Display & a11y prefs
 * live client-side (see app/settings.tsx), not here. */
export type Settings = {
  ai_preset: AIPreset;
  whisper_model: WhisperModel;
  onboarded: boolean;
};

// ── Citations ────────────────────────────────────────────────────────────
export type SourceLocation =
  | { type: "page"; page: number }
  | { type: "timestamp"; timestamp_ms: number };

export type SourceRef = {
  source_id: string;
  source_title: string;
  location: SourceLocation;
  excerpt: string;
};

// ── Library ──────────────────────────────────────────────────────────────
export type Subject = {
  id: string;
  name: string;
  color: string; // hex — the subject's accent
  created_at: string;
};

export type SourceType = "pdf" | "slide" | "audio";
export type IngestState = "queued" | "processing" | "processed" | "error";

export type Source = {
  id: string;
  subject_id: string;
  type: SourceType;
  title: string;
  file_path: string;
  ingest_state: IngestState;
  /** 0..1 while processing. */
  progress?: number;
  /** "parsing" | "transcribing" | "chunking" | "embedding" */
  step?: string;
  /** Pages for pdf/slide, undefined for audio. */
  page_count?: number;
  chunk_count?: number;
  error?: string;
  /** Week this material is assigned to, or null/undefined if unassigned. */
  week_id?: string | null;
  added_at: string;
};

// ── Generated content (post-review = approved) ───────────────────────────
export type Card = {
  id: string;
  subject_id: string;
  front: string;
  back: string;
  explanation: string;
  source_ref: SourceRef;
  reviewed: boolean;
};

export type QuizItem = {
  id: string;
  subject_id: string;
  question: string;
  options: [string, string, string, string];
  answer_index: 0 | 1 | 2 | 3;
  explanation: string;
  source_ref: SourceRef;
  reviewed: boolean;
};

export type NoteFormat = "cornell" | "outline";
export type Note = {
  id: string;
  subject_id: string;
  content: string; // Markdown
  format: NoteFormat;
  source_refs: SourceRef[];
  reviewed: boolean;
};

/** An item awaiting review in the mandatory gate (S-05). */
export type ReviewItem =
  | ({ kind: "card" } & Card)
  | ({ kind: "quiz" } & QuizItem)
  | ({ kind: "note" } & Note);

// ── Study / FSRS ─────────────────────────────────────────────────────────
export type CardState = "new" | "learning" | "review" | "relearning";
export type CardSchedule = {
  card_id: string;
  due: string;
  stability: number;
  difficulty: number;
  state: CardState;
  last_review: string | null;
};

export type DueCard = { card: Card; schedule: CardSchedule };

export type StudyStats = {
  due_today: number;
  due_this_week: number;
  mastered: number;
  streak: number;
};

// ── Unit outline / semester structure ─────────────────────────────────────
/** One week of the unit. `start_date` is derived from the term start but stored
 * per row so a single week can be nudged. */
export type Week = {
  id: string;
  subject_id: string;
  week_number: number;
  title: string;
  summary: string;
  start_date: string | null;
};

/** The subject's semester structure. `week_count` is null until an outline is set. */
export type Outline = {
  term_start: string | null;
  week_count: number | null;
  weeks: Week[];
};

/** A "focus next" suggestion for one week, ranked by the priority engine from
 * deadline proximity + unstudied volume. `reason` is a calm, pre-built phrase.
 * Weeks with nothing left to study are omitted, never shown as "behind". */
export type PriorityItem = {
  week_id: string;
  week_number: number;
  title: string;
  reason: string;
  days_until_deadline: number | null;
  unstudied_count: number;
};

/** A syllabus parsed by the AI sidecar but **not yet committed** — the user
 * reviews and edits these rows, then commits. Nothing is written until then. */
export type ParsedWeek = {
  week_number: number;
  title: string;
  summary: string;
};

export type ParsedDeadline = {
  title: string;
  /** ISO date (YYYY-MM-DD) or "" — the user sets blank ones during review. */
  due_date: string;
  type: DeadlineType;
};

export type ParsedOutline = {
  weeks: ParsedWeek[];
  deadlines: ParsedDeadline[];
};

// ── Planning ─────────────────────────────────────────────────────────────
export type DeadlineType = "exam" | "assignment" | "other";
export type Deadline = {
  id: string;
  subject_id: string;
  title: string;
  due_at: string;
  type: DeadlineType;
};

export type Grade = {
  id: string;
  subject_id: string;
  name: string;
  category: string;
  score: number | null; // null = not yet graded
  max_score: number;
  weight: number; // 0..1
};

export type GradeSummary = {
  current_average: number | null;
  gpa: number | null;
  /** what-if rows: hypothetical final score → resulting gpa */
  what_if: { label: string; gpa: number }[];
};

// ── Dashboard / Tree ─────────────────────────────────────────────────────
export type TreeData = {
  mastery_pct: number; // 0..1 → tree size
  concepts_total: number;
  concepts_mastered: number; // green leaves
  concepts_learning: number; // gold leaves
};

export type SubjectDashboard = {
  subject_id: string;
  tree: TreeData;
  stats: StudyStats;
  next_deadline: Deadline | null;
};
