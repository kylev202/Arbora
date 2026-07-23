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

// ── User profile (redesign slice A) ───────────────────────────────────────
export type StudyGoal = "pass" | "high_gpa";

/** Onboarding interview answers (singleton row). Every field is nullable —
 * each step can be skipped and the profile edited later in Settings. */
export type UserProfile = {
  name: string | null;
  year: string | null;
  major: string | null;
  term_start: string | null; // ISO date
  term_end: string | null; // ISO date
  wake_time: string | null; // "HH:MM"
  sleep_time: string | null; // "HH:MM"
  goal: StudyGoal | null;
};

/** A weekly recurring free-to-study slot. weekday: 0=Monday … 6=Sunday. */
export type StudyWindow = {
  id: string;
  weekday: number;
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
};

export type StudyWindowInput = Omit<StudyWindow, "id">;

/** Device capability snapshot (RAM only) for the preset recommendation. */
export type SystemInfo = {
  total_ram_gb: number;
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

/** What kind of course a subject is — steers subject-aware generation (math
 * emits LaTeX, cs emits fenced code, …). Notes typeset any formula the material
 * itself states under every discipline; cards/quizzes stay plain text. */
export type Discipline = "general" | "math" | "cs" | "science" | "humanities";

/** Picker options, in display order. `hint` explains what the discipline
 * changes about generated material. */
export const DISCIPLINES: { value: Discipline; label: string; hint: string }[] = [
  { value: "general", label: "General", hint: "Plain prose notes — the default." },
  { value: "math", label: "Math & quantitative", hint: "Equations as LaTeX, worked steps." },
  { value: "cs", label: "CS & engineering", hint: "Fenced code blocks, algorithms." },
  { value: "science", label: "Life & physical sciences", hint: "Formulas, tables, processes." },
  { value: "humanities", label: "Humanities & social science", hint: "Essays, arguments, figures." },
];

export type Subject = {
  id: string;
  name: string;
  color: string; // hex — the subject's accent
  created_at: string;
  discipline: Discipline;
};

export type SourceType = "pdf" | "slide" | "audio" | "doc" | "text";
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
  /** Pages for pdf/slide (paragraphs for doc/text), undefined for audio. */
  page_count?: number;
  chunk_count?: number;
  error?: string;
  /** Week this material is assigned to, or null/undefined if unassigned. */
  week_id?: string | null;
  /** Drive folder this file is organized into, or null when loose. Organization
   * only — never affects AI scoping (that's `subject_id`). */
  folder_id?: string | null;
  added_at: string;
};

/** A user-created Drive folder (nestable). Subject-independent — it groups files
 * for browsing only, mirroring the OneNote-style note folder tree. */
export type SourceFolder = {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
};

/** One chunk of a source's extracted text, for the in-app Drive viewer. Same
 * text citations point at, so a citation click can highlight within it. */
export type SourceChunk = {
  page: number | null;
  timestamp_ms: number | null;
  text: string;
};

/** A user highlight (`note === null`) or comment on a source's text. */
export type Annotation = {
  id: string;
  source_id: string;
  page: number | null;
  quote: string;
  note: string | null;
  color: string;
  created_at: string;
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

/** A grounded, cited study brief for one assignment (slice 5). Same citation
 * model as a note; staged for the review gate, then shown on the Plan screen. */
export type AssignmentBrief = {
  id: string;
  subject_id: string;
  deadline_id: string;
  content: string; // Markdown focus list
  source_refs: SourceRef[];
  reviewed: boolean;
};

/** A brief as it appears in the review queue (carries its assignment's title). */
export type AssignmentBriefReview = AssignmentBrief & { deadline_title: string };

/** An item awaiting review in the mandatory gate (S-05). */
export type ReviewItem =
  | ({ kind: "card" } & Card)
  | ({ kind: "quiz" } & QuizItem)
  | ({ kind: "note" } & Note)
  | ({ kind: "brief" } & AssignmentBriefReview);

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

export type ParsedClass = {
  label: string;
  schedule: string;
  mode: string;
  attendance: string;
};

export type ParsedAssessment = {
  name: string;
  /** 0 = the syllabus didn't state a weighting. */
  weight_percent: number;
  due_text: string;
};

export type ParsedUnitInfo = {
  unit_code: string;
  coordinator_name: string;
  coordinator_contact: string;
  delivery_summary: string;
  classes: ParsedClass[];
  assessments: ParsedAssessment[];
};

export type ParsedOutline = {
  weeks: ParsedWeek[];
  deadlines: ParsedDeadline[];
  unit_info: ParsedUnitInfo;
};

/** Stored unit info, as `get_unit_info` returns it (null = never imported). */
export type UnitClass = {
  id: string;
  label: string;
  schedule: string;
  mode: string;
  attendance: string;
};

export type UnitInfo = {
  unit_code: string;
  coordinator_name: string;
  coordinator_contact: string;
  delivery_summary: string;
  classes: UnitClass[];
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

/** An approaching deadline for the app-wide alert banner (ADR-0013): a `Deadline`
 * plus its subject name and whole days until due (0 = today). */
export type DeadlineAlert = Deadline & {
  subject_name: string;
  days_until: number;
};

/** An assignment spec parsed by the AI sidecar but **not yet committed** —
 * reviewed/edited in a modal, then `commitAssignmentSpec` persists it. */
export type ParsedSpec = {
  overview: string;
  /** ISO date (YYYY-MM-DD) or "" — only applied when the user opts in. */
  due_date: string;
  requirements: string[];
  process_steps: string[];
  plan_steps: string[];
};

export type ParsedRubricLevel = { label: string; descriptor: string };
export type ParsedRubricCriterion = {
  name: string;
  weight_text: string;
  levels: ParsedRubricLevel[];
};
export type ParsedRubric = { criteria: ParsedRubricCriterion[] };

/** Stored assignment detail, as `getAssignmentDetail` returns it. */
export type AssignmentItemKind = "requirement" | "process" | "plan";
export type AssignmentItem = {
  id: string;
  kind: AssignmentItemKind;
  text: string;
  done: boolean;
  /** Set once the step was added to Todos (idempotent). */
  todo_id: string | null;
};

export type RubricLevel = { label: string; descriptor: string };
export type RubricCriterion = {
  id: string;
  name: string;
  weight_text: string;
  levels: RubricLevel[];
};

export type AssignmentDetail = {
  overview: string;
  items: AssignmentItem[];
  criteria: RubricCriterion[];
  spec_source_id: string | null;
  rubric_source_id: string | null;
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

/** The outline week we're currently in; `source_count === 0` drives the calm
 * empty-state CTA (§4.2). */
export type CurrentWeek = {
  week_id: string;
  week_number: number;
  title: string;
  summary: string;
  source_count: number;
};

/** Neutral last-week / this-week review counts + the current outline week. */
export type WeekProgress = {
  reviews_this_week: number;
  reviews_last_week: number;
  current_week: CurrentWeek | null;
};

export type SubjectDashboard = {
  subject_id: string;
  tree: TreeData;
  stats: StudyStats;
  next_deadline: Deadline | null;
  week_progress: WeekProgress;
};

// ── RAG Q&A ──────────────────────────────────────────────────────────────
/** One prior turn, sent with follow-up questions so the sidecar can resolve
 * "it"/"that" against the conversation. Ephemeral — never persisted. */
export type ChatHistoryTurn = { role: "user" | "assistant"; content: string };

export type ChatMessageResponse = {
  answer: string;
  citations: SourceRef[];
  /** Up to 3 follow-up questions answerable from the retrieved passages. */
  suggested_questions: string[];
};

// ── Calendar + todos (redesign slice D) ───────────────────────────────────
export type EventKind = "lecture" | "study" | "deadline" | "custom" | "class";
export type EventStatus = "planned" | "done" | "moved";

/** A timetable event. Times are naive local ISO ("YYYY-MM-DDTHH:MM") — a study
 * session is a wall-clock commitment. `origin: "ai"` rows only exist after the
 * user accepted a proposal (law #2). */
export type CalendarEvent = {
  id: string;
  subject_id: string | null;
  title: string;
  start_at: string;
  end_at: string;
  kind: EventKind;
  kind_label: string | null;
  color: string | null; // hex accent override; null = colour by kind
  all_day: boolean; // true = shown in the all-day strip, not the hour grid
  status: EventStatus;
  origin: "user" | "ai";
  recurrence_group_id: string | null;
};

export type TodoSource = "setup" | "ai" | "user";
export type TodoRepeat = "daily" | "weekly" | "monthly";

export type Todo = {
  id: string;
  subject_id: string | null;
  title: string;
  due: string | null;
  session_slot: string | null;
  kind: string;
  done: boolean;
  source: TodoSource;
  notes: string | null;
  repeat: TodoRepeat | null;
  /** Calendar event auto-created to mirror `due`, or null when there's no due date. */
  linked_event_id: string | null;
};

// ── User-authored notes (OneNote-style Notes app) ─────────────────────────
export type NoteFolderKind = "subject" | "user" | "quick";

export type NoteFolder = {
  id: string;
  subject_id: string | null;
  parent_id: string | null;
  name: string;
  kind: NoteFolderKind;
  created_at: string;
};

/** A user's own note (TipTap HTML in `content`) — no review gate, distinct from
 * the AI-generated `Note`. */
export type UserNote = {
  id: string;
  folder_id: string;
  subject_id: string | null;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

// ── Learning path (redesign slice F) ──────────────────────────────────────
/** One stage of the in-subject path (an outline week + its card mastery).
 * Stage state is derived from mastery, never dates — no "overdue" (ADR-0007). */
export type PathStage = {
  week_id: string;
  week_number: number;
  title: string;
  total_cards: number;
  mastered_cards: number;
  due_cards: number;
};

export type SubjectPath = {
  stages: PathStage[];
  todos_done_today: number;
  todos_total_today: number;
};

// ── Week walkthrough / journey (guided week session) ──────────────────────
/** One lesson checkpoint of the week journey. The note is AI-generated and
 * staged; `reviewed` flips when the user keeps it on first read (the inline
 * review gate, law #2). `completed_at` marks the checkpoint done. */
export type WalkthroughLesson = {
  id: string;
  lesson_index: number;
  title: string;
  content: string; // Markdown
  reviewed: boolean;
  completed_at: string | null;
  source_refs: SourceRef[];
};

/** The week's guided journey: an overview note + small lesson checkpoints.
 * At most one per week; regenerating replaces it and resets progress. */
export type WeekWalkthrough = {
  id: string;
  subject_id: string;
  week_id: string;
  overview: string; // Markdown
  overview_refs: SourceRef[];
  reviewed: boolean;
  completed_at: string | null;
  lessons: WalkthroughLesson[];
};

// ── Pet companion (redesign slice B) ──────────────────────────────────────
/** The pet's routed reply. `answer` carries authoritative citations (law #1);
 * the other kinds are calm state messages the UI renders itself. */
export type PetReply =
  | { kind: "answer"; answer: string; citations: SourceRef[] }
  | { kind: "needs_subject" }
  | { kind: "no_material" }
  | { kind: "schedule_request" }
  | { kind: "refusal" };

// ── AI week scheduler (redesign slice E) ──────────────────────────────────
/** One proposed study session. Pure proposal — becomes an event + linked todo
 * only via acceptSchedule (law #2). `reason` is a calm pre-built phrase. */
export type ProposedSession = {
  subject_id: string | null;
  title: string;
  start_at: string;
  end_at: string;
  kind: string;
  reason: string;
};

/** A neutral "move this missed session here" proposal. */
export type ProposedMove = {
  event_id: string;
  title: string;
  start_at: string;
  end_at: string;
  reason: string;
};

/** How a subject's weekly study target is covered — for the calm "N of M
 * planned" line and the keep-filling loop's stop condition. */
export type SubjectCoverage = {
  subject_id: string;
  name: string;
  needed: number;
  scheduled: number;
  proposed: number;
};

export type SchedulePlan = {
  sessions: ProposedSession[];
  moves: ProposedMove[];
  coverage: SubjectCoverage[];
  remaining: number;
};

// ── Mermaid diagrams ──────────────────────────────────────────────────────
export type DiagramResponse = {
  title: string;
  mermaid_code: string;
  citations: SourceRef[];
};

// ── Practice tests (subject view redesign) ───────────────────────────────
/** Test items are ephemeral and cited — generated for one session, never
 * persisted (chat/diagram precedent; law #2 covers stored deck items). */
export type TestKind = "multiple_choice" | "short_answer" | "matching" | "ordering" | "feynman";

export type MatchPair = { left: string; right: string };

export type TestItem =
  | {
      kind: "multiple_choice";
      question: string;
      options: string[];
      answer_index: number;
      explanation: string;
      source_ref: SourceRef;
    }
  | { kind: "short_answer"; question: string; expected_answer: string; source_ref: SourceRef }
  | { kind: "matching"; instruction: string; pairs: MatchPair[]; source_ref: SourceRef }
  | { kind: "ordering"; instruction: string; steps: string[]; source_ref: SourceRef }
  | { kind: "feynman"; concept: string; key_points: string[]; source_ref: SourceRef };

/** Structured grade of a free-text answer (short answer / Feynman). */
export type TestGrade = {
  verdict: "correct" | "partial" | "incorrect";
  feedback: string;
};

// ── Knowledge map ─────────────────────────────────────────────────────────
export type ConceptMastery = "mastered" | "learning" | "unstarted";

export type ConceptEntry = {
  id: string;
  concept: string;
  back: string;
  mastery: ConceptMastery;
  source_title: string;
  page: number | null;
  timestamp_ms: number | null;
};
