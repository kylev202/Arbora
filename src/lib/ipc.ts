/**
 * Typed client for the Rust core's IPC surface.
 *
 * This is the single seam between the React UI and the Tauri core: the UI calls
 * these functions, never `invoke("...")` with a raw command name. Keeping the
 * command strings and their argument/return shapes in one place means a change
 * to a Rust command surfaces here as a type error instead of a runtime mystery.
 *
 * Mirror of `src-tauri/src/commands.rs`. When you add a command there, add its
 * wrapper here.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Card,
  Deadline,
  DeadlineType,
  DueCard,
  FSRSRating,
  Grade,
  GradeSummary,
  Note,
  Outline,
  ParsedDeadline,
  ParsedOutline,
  ParsedWeek,
  PriorityItem,
  QuizItem,
  ReviewItem,
  Settings,
  Source,
  StudyStats,
  Subject,
  SubjectDashboard,
  Week,
} from "./types";

/** Snapshot of the Python AI sidecar, as reported by the Rust core. */
export type SidecarStatus = {
  ready: boolean;
  base_url: string | null;
};

/** Lifecycle transitions the core emits on the `sidecar:status` channel. */
export type SidecarEvent = {
  state: "starting" | "ready" | "crashed";
  error?: string;
};

/** Liveness ping of the Rust core. Returns the greeting it echoes back. */
export function greet(name: string): Promise<string> {
  return invoke<string>("greet", { name });
}

/** Number of rows in the settings table — proves the DB opened and migrated. */
export function dbHealth(): Promise<number> {
  return invoke<number>("db_health");
}

/** Current sidecar readiness + base URL. */
export function sidecarStatus(): Promise<SidecarStatus> {
  return invoke<SidecarStatus>("sidecar_status");
}

/**
 * Subscribe to sidecar lifecycle events. Returns the unlisten function; call it
 * on unmount. Resolves once the listener is registered.
 */
export function onSidecarStatus(
  handler: (event: SidecarEvent) => void,
): Promise<UnlistenFn> {
  return listen<SidecarEvent>("sidecar:status", (e) => handler(e.payload));
}

// ── Subjects (Slice 0) ─────────────────────────────────────────────────────

/** All subjects, oldest first. */
export function listSubjects(): Promise<Subject[]> {
  return invoke<Subject[]>("list_subjects");
}

/** One subject by id. Rejects with `SUBJECT_NOT_FOUND` if it doesn't exist. */
export function getSubject(id: string): Promise<Subject> {
  return invoke<Subject>("get_subject", { id });
}

/** Create a subject and return the persisted row. */
export function createSubject(name: string, color: string): Promise<Subject> {
  return invoke<Subject>("create_subject", { name, color });
}

/** Patch a subject's name and/or color; returns the updated row. */
export function updateSubject(
  id: string,
  patch: { name?: string; color?: string },
): Promise<Subject> {
  return invoke<Subject>("update_subject", { id, name: patch.name, color: patch.color });
}

/** Delete a subject; sources/cards/grades cascade in SQLite. */
export function deleteSubject(id: string): Promise<void> {
  return invoke<void>("delete_subject", { id });
}

// ── Sources + ingest (Slice 1) ─────────────────────────────────────────────

/** Sources for a subject, oldest first. */
export function listSources(subjectId: string): Promise<Source[]> {
  return invoke<Source[]>("list_sources", { subjectId });
}

/** Register a file as a source (type auto-detected); returns the queued row. */
export function addSource(subjectId: string, filePath: string): Promise<Source> {
  return invoke<Source>("add_source", { subjectId, filePath });
}

/** Delete a source; its chunks cascade in SQLite. */
export function deleteSource(id: string): Promise<void> {
  return invoke<void>("delete_source", { id });
}

/** Start ingest (parse→chunk→embed→index). Returns the job id; progress and
 * completion arrive as `ingest:*` events. */
export function ingestSource(sourceId: string): Promise<{ job_id: string }> {
  return invoke<{ job_id: string }>("ingest_source", { sourceId });
}

export type IngestProgress = { source_id: string; job_id: string; progress: number; step: string };
export type IngestDone = { source_id: string; job_id: string; chunk_count: number };
export type IngestError = { source_id: string; job_id: string; error: string };

export function onIngestProgress(handler: (e: IngestProgress) => void): Promise<UnlistenFn> {
  return listen<IngestProgress>("ingest:progress", (e) => handler(e.payload));
}
export function onIngestDone(handler: (e: IngestDone) => void): Promise<UnlistenFn> {
  return listen<IngestDone>("ingest:done", (e) => handler(e.payload));
}
export function onIngestError(handler: (e: IngestError) => void): Promise<UnlistenFn> {
  return listen<IngestError>("ingest:error", (e) => handler(e.payload));
}

// ── Generate + review gate (Slice 2) ───────────────────────────────────────

/** Start grounded generation from a subject's processed sources. Returns the
 * job id; items land staged (reviewed=0) and progress arrives as `generate:*`. */
export function generateContent(
  subjectId: string,
  sourceIds: string[],
  types: string[],
): Promise<{ job_id: string }> {
  return invoke<{ job_id: string }>("generate_content", { subjectId, sourceIds, types });
}

export type GenerateProgress = { job_id: string; progress: number; items_generated: number | null };
export type GenerateDone = { job_id: string; items_generated: number };
export type GenerateError = { job_id: string; error: string };

export function onGenerateProgress(handler: (e: GenerateProgress) => void): Promise<UnlistenFn> {
  return listen<GenerateProgress>("generate:progress", (e) => handler(e.payload));
}
export function onGenerateDone(handler: (e: GenerateDone) => void): Promise<UnlistenFn> {
  return listen<GenerateDone>("generate:done", (e) => handler(e.payload));
}
export function onGenerateError(handler: (e: GenerateError) => void): Promise<UnlistenFn> {
  return listen<GenerateError>("generate:error", (e) => handler(e.payload));
}

/** Items staged for the mandatory review gate (reviewed=0), with citations. */
export function getReviewQueue(subjectId: string): Promise<ReviewItem[]> {
  return invoke<ReviewItem[]>("get_review_queue", { subjectId });
}

// Approve = trust it (reviewed=1; cards enrol into FSRS). Reject = delete the
// staged row. `edits` keys are snake_case (serde struct, not Tauri arg-mapped).
export type CardEdits = { front?: string; back?: string; explanation?: string };
export type QuizEdits = {
  question?: string;
  options?: string[];
  answer_index?: number;
  explanation?: string;
};
export type NoteEdits = { content?: string };

export function approveCard(cardId: string, edits?: CardEdits): Promise<void> {
  return invoke<void>("approve_card", { cardId, edits });
}
export function rejectCard(cardId: string): Promise<void> {
  return invoke<void>("reject_card", { cardId });
}
export function approveQuizItem(itemId: string, edits?: QuizEdits): Promise<void> {
  return invoke<void>("approve_quiz_item", { itemId, edits });
}
export function rejectQuizItem(itemId: string): Promise<void> {
  return invoke<void>("reject_quiz_item", { itemId });
}
export function approveNote(noteId: string, edits?: NoteEdits): Promise<void> {
  return invoke<void>("approve_note", { noteId, edits });
}
export function rejectNote(noteId: string): Promise<void> {
  return invoke<void>("reject_note", { noteId });
}

// ── Study / FSRS (Slice 3) ─────────────────────────────────────────────────

/** Cards due right now for a subject, oldest-due first. */
export function getDueCards(subjectId: string): Promise<DueCard[]> {
  return invoke<DueCard[]>("get_due_cards", { subjectId });
}

/** Advance a card's FSRS state after a review. Fire-and-forget is fine; the
 *  UI advances optimistically without waiting for the result. */
export function submitCardReview(
  cardId: string,
  rating: FSRSRating,
): Promise<{ due: string; state: string }> {
  return invoke<{ due: string; state: string }>("submit_card_review", { cardId, rating });
}

/** Counts and streak for the StudyTab widget. */
export function getStudyStats(subjectId: string): Promise<StudyStats> {
  return invoke<StudyStats>("get_study_stats", { subjectId });
}

// ── Content browsing + dashboard (Slice 4) ─────────────────────────────────

/** Approved (reviewed=1) flashcards for a subject, oldest first. */
export function listCards(subjectId: string): Promise<Card[]> {
  return invoke<Card[]>("list_cards", { subjectId });
}

/** Approved quiz items for a subject, oldest first. */
export function listQuiz(subjectId: string): Promise<QuizItem[]> {
  return invoke<QuizItem[]>("list_quiz", { subjectId });
}

/** Approved notes (with citations) for a subject, oldest first. */
export function listNotes(subjectId: string): Promise<Note[]> {
  return invoke<Note[]>("list_notes", { subjectId });
}

/** Tree + stats + next deadline for the subject dashboard. */
export function getSubjectDashboard(subjectId: string): Promise<SubjectDashboard> {
  return invoke<SubjectDashboard>("get_subject_dashboard", { subjectId });
}

// ── Planning: deadlines + grade book (Slice 4) ─────────────────────────────

/** Deadlines for a subject, earliest first. */
export function listDeadlines(subjectId: string): Promise<Deadline[]> {
  return invoke<Deadline[]>("list_deadlines", { subjectId });
}

/** Create a deadline; returns the persisted row. */
export function createDeadline(
  subjectId: string,
  title: string,
  dueAt: string,
  type: DeadlineType,
): Promise<Deadline> {
  return invoke<Deadline>("create_deadline", { subjectId, title, dueAt, type });
}

/** Delete a deadline. */
export function deleteDeadline(id: string): Promise<void> {
  return invoke<void>("delete_deadline", { id });
}

/** Grade-book items for a subject. */
export function listGrades(subjectId: string): Promise<Grade[]> {
  return invoke<Grade[]>("list_grades", { subjectId });
}

/** Create a graded (or not-yet-graded) item; returns the persisted row. */
export function createGrade(
  subjectId: string,
  grade: { name: string; category: string; score: number | null; max_score: number; weight: number },
): Promise<Grade> {
  return invoke<Grade>("create_grade", {
    subjectId,
    name: grade.name,
    category: grade.category,
    score: grade.score,
    maxScore: grade.max_score,
    weight: grade.weight,
  });
}

/** Delete a grade-book item. */
export function deleteGrade(id: string): Promise<void> {
  return invoke<void>("delete_grade", { id });
}

/** Weighted current average + what-if projections for the grade book. */
export function getGradeSummary(subjectId: string): Promise<GradeSummary> {
  return invoke<GradeSummary>("get_grade_summary", { subjectId });
}

// ── Unit outline / weeks (semester planning) ───────────────────────────────

/** The subject's outline: term start, week count, and its weeks (ordered). */
export function getOutline(subjectId: string): Promise<Outline> {
  return invoke<Outline>("get_outline", { subjectId });
}

/** Create/update the outline. Reconciles week rows to `weekCount` (keeping any
 * titles/summaries already entered) and recomputes each week's start date. */
export function setOutline(
  subjectId: string,
  termStart: string | null,
  weekCount: number,
): Promise<Outline> {
  return invoke<Outline>("set_outline", { subjectId, termStart, weekCount });
}

/** Patch a week's topic/summary/start date; returns the updated row. */
export function updateWeek(
  weekId: string,
  patch: { title?: string; summary?: string; start_date?: string },
): Promise<Week> {
  return invoke<Week>("update_week", {
    weekId,
    title: patch.title,
    summary: patch.summary,
    startDate: patch.start_date,
  });
}

/** Assign a source to a week, or pass null to unassign it. */
export function assignSourceWeek(sourceId: string, weekId: string | null): Promise<void> {
  return invoke<void>("assign_source_week", { sourceId, weekId });
}

/** Replace which weeks an assignment (deadline) draws on. */
export function setAssignmentCoverage(deadlineId: string, weekIds: string[]): Promise<void> {
  return invoke<void>("set_assignment_coverage", { deadlineId, weekIds });
}

/** Week ids an assignment covers, ordered by week number. */
export function getAssignmentCoverage(deadlineId: string): Promise<string[]> {
  return invoke<string[]>("get_assignment_coverage", { deadlineId });
}

/** Ranked "focus next" suggestions per week (deadline proximity + unstudied
 * volume). Weeks with nothing left to study are omitted. */
export function getPriorityQueue(subjectId: string): Promise<PriorityItem[]> {
  return invoke<PriorityItem[]>("get_priority_queue", { subjectId });
}

/** AI-parse a syllabus file into editable weeks + deadlines. Writes nothing —
 * the result is staged for review; `commitParsedOutline` persists it. Rejects
 * with `SIDECAR_UNAVAILABLE` if the sidecar isn't ready, or `PARSE_FAILED: …`. */
export function parseOutlineFile(subjectId: string, filePath: string): Promise<ParsedOutline> {
  return invoke<ParsedOutline>("parse_outline_file", { subjectId, filePath });
}

/** Persist a user-confirmed parsed outline in one transaction (weeks + dated
 * deadlines). Returns the resulting outline. */
export function commitParsedOutline(
  subjectId: string,
  termStart: string | null,
  weeks: ParsedWeek[],
  deadlines: ParsedDeadline[],
): Promise<Outline> {
  return invoke<Outline>("commit_parsed_outline", { subjectId, termStart, weeks, deadlines });
}

// ── Settings singleton (Slice 4) ───────────────────────────────────────────

/** Read the persisted device/AI settings. */
export function getSettings(): Promise<Settings> {
  return invoke<Settings>("get_settings");
}

/** Patch any subset of the persisted settings; returns the updated row. */
export function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  return invoke<Settings>("update_settings", {
    aiPreset: patch.ai_preset,
    whisperModel: patch.whisper_model,
    onboarded: patch.onboarded,
  });
}

// ── Anki export (Slice 4) ──────────────────────────────────────────────────

export type ExportResult = { path: string; card_count: number };

/** Export a subject's approved (reviewed) cards to an `.apkg` at `outPath`.
 *  Rejects with `NO_CARDS_TO_EXPORT` if nothing is approved yet. */
export function exportApkg(subjectId: string, outPath: string): Promise<ExportResult> {
  return invoke<ExportResult>("export_apkg", { subjectId, outPath });
}
