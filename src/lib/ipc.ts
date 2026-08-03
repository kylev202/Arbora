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
  Annotation,
  AssignmentBrief,
  AssignmentDetail,
  CalendarEvent,
  Card,
  ChatHistoryTurn,
  ChatMessageResponse,
  ConceptEntry,
  Deadline,
  DeadlineAlert,
  DiagramResponse,
  DeadlineType,
  Discipline,
  DueCard,
  EventKind,
  EventStatus,
  FSRSRating,
  Grade,
  GradeSummary,
  Note,
  NoteFolder,
  Outline,
  ParsedDeadline,
  ParsedOutline,
  ParsedRubric,
  ParsedSpec,
  ParsedUnitInfo,
  ParsedWeek,
  PetReply,
  PriorityItem,
  ProposedMove,
  ProposedSession,
  SchedulePlan,
  QuizItem,
  ReviewItem,
  Settings,
  Source,
  SourceChunk,
  SourceFolder,
  StudyStats,
  StudyWindow,
  StudyWindowInput,
  Subject,
  SubjectDashboard,
  SubjectPath,
  SystemInfo,
  TestGrade,
  TestItem,
  TestKind,
  Todo,
  TodoRepeat,
  UnitInfo,
  UnitPlan,
  UnitPlanDraft,
  UserNote,
  UserProfile,
  Week,
  WeekWalkthrough,
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

/** Re-run sidecar startup after a crash (the app-shell "Try again"). Returns
 * once the restart is kicked off; progress arrives via `onSidecarStatus`. */
export function restartSidecar(): Promise<void> {
  return invoke("restart_sidecar");
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

/** Create a subject and return the persisted row. Discipline defaults to
 * `general` server-side when omitted. */
export function createSubject(
  name: string,
  color: string,
  discipline?: Discipline,
): Promise<Subject> {
  return invoke<Subject>("create_subject", { name, color, discipline });
}

/** Patch a subject's name, color and/or discipline; returns the updated row. */
export function updateSubject(
  id: string,
  patch: { name?: string; color?: string; discipline?: Discipline },
): Promise<Subject> {
  return invoke<Subject>("update_subject", {
    id,
    name: patch.name,
    color: patch.color,
    discipline: patch.discipline,
  });
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

/** Register a file as a source (type auto-detected); returns the queued row.
 * `folderId` optionally files it into a Drive folder. */
export function addSource(
  subjectId: string,
  filePath: string,
  folderId?: string | null,
): Promise<Source> {
  return invoke<Source>("add_source", { subjectId, filePath, folderId: folderId ?? null });
}

/** One source row by id (resolves the original file path + type for the reader). */
export function getSource(id: string): Promise<Source> {
  return invoke<Source>("get_source", { id });
}

/** Rename a source's display title; returns the updated row. */
export function renameSource(id: string, title: string): Promise<Source> {
  return invoke<Source>("rename_source", { id, title });
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

// ── Source viewer + annotations (Drive page) ───────────────────────────────

/** A source's extracted text, chunk by chunk, for the in-app viewer. */
export function getSourceChunks(sourceId: string): Promise<SourceChunk[]> {
  return invoke<SourceChunk[]>("get_source_chunks", { sourceId });
}

export function listAnnotations(sourceId: string): Promise<Annotation[]> {
  return invoke<Annotation[]>("list_annotations", { sourceId });
}

/** Add a highlight (`note` omitted) or comment on a source's text. */
export function createAnnotation(a: {
  source_id: string;
  page?: number | null;
  quote: string;
  note?: string | null;
  color?: string | null;
}): Promise<Annotation> {
  return invoke<Annotation>("create_annotation", {
    sourceId: a.source_id,
    page: a.page ?? null,
    quote: a.quote,
    note: a.note ?? null,
    color: a.color ?? null,
  });
}

export function deleteAnnotation(id: string): Promise<void> {
  return invoke<void>("delete_annotation", { id });
}

// ── Drive folders (user-managed source organization) ───────────────────────

/** The whole Drive folder tree (flat; the UI nests by `parent_id`). */
export function listSourceFolders(): Promise<SourceFolder[]> {
  return invoke<SourceFolder[]>("list_source_folders");
}

export function createSourceFolder(name: string, parentId?: string | null): Promise<SourceFolder> {
  return invoke<SourceFolder>("create_source_folder", { name, parentId: parentId ?? null });
}

export function renameSourceFolder(id: string, name: string): Promise<SourceFolder> {
  return invoke<SourceFolder>("rename_source_folder", { id, name });
}

/** Delete a folder (subfolders cascade; files inside are detached, not deleted). */
export function deleteSourceFolder(id: string): Promise<void> {
  return invoke<void>("delete_source_folder", { id });
}

/** Files assigned to a folder, across all subjects. */
export function listFolderSources(folderId: string): Promise<Source[]> {
  return invoke<Source[]>("list_folder_sources", { folderId });
}

/** Move a file into a folder, or out of any folder when `folderId` is null. */
export function setSourceFolder(sourceId: string, folderId: string | null): Promise<Source> {
  return invoke<Source>("set_source_folder", { sourceId, folderId });
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

/** Generate a grounded, cited study brief for one assignment from the material
 * in the weeks it covers. Returns the job id; the brief lands staged (reviewed=0)
 * and progress arrives as `brief:*`. Rejects if the covered weeks have no
 * processed material, or `SIDECAR_UNAVAILABLE`. */
export function generateAssignmentBrief(
  subjectId: string,
  deadlineId: string,
): Promise<{ job_id: string }> {
  return invoke<{ job_id: string }>("generate_assignment_brief", { subjectId, deadlineId });
}

export type BriefProgress = { job_id: string; progress: number; items_generated: number | null };
export type BriefDone = { job_id: string; items_generated: number };
export type BriefError = { job_id: string; error: string };

export function onBriefProgress(handler: (e: BriefProgress) => void): Promise<UnlistenFn> {
  return listen<BriefProgress>("brief:progress", (e) => handler(e.payload));
}
export function onBriefDone(handler: (e: BriefDone) => void): Promise<UnlistenFn> {
  return listen<BriefDone>("brief:done", (e) => handler(e.payload));
}
export function onBriefError(handler: (e: BriefError) => void): Promise<UnlistenFn> {
  return listen<BriefError>("brief:error", (e) => handler(e.payload));
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
export type BriefEdits = { content?: string };
export function approveBrief(briefId: string, edits?: BriefEdits): Promise<void> {
  return invoke<void>("approve_brief", { briefId, edits });
}
export function rejectBrief(briefId: string): Promise<void> {
  return invoke<void>("reject_brief", { briefId });
}

// ── Study / FSRS (Slice 3) ─────────────────────────────────────────────────

/** Cards due right now for a subject, oldest-due first. */
export function getDueCards(subjectId: string, limit?: number): Promise<DueCard[]> {
  return invoke<DueCard[]>("get_due_cards", { subjectId, limit });
}

export function getDueCardsInterleaved(): Promise<DueCard[]> {
  return invoke<DueCard[]>("get_due_cards_interleaved");
}

export function getDueCardsPrioritized(daysAhead?: number): Promise<DueCard[]> {
  return invoke<DueCard[]>("get_due_cards_prioritized", { daysAhead });
}

/** Advance a card's FSRS state after a review. Fire-and-forget is fine; the
 *  UI advances optimistically without waiting for the result. */
export function submitCardReview(
  cardId: string,
  rating: FSRSRating,
): Promise<{ due: string; state: string }> {
  return invoke<{ due: string; state: string }>("submit_card_review", { cardId, rating });
}

/** Counts and streak for the Study page widgets. */
export function getStudyStats(subjectId: string): Promise<StudyStats> {
  return invoke<StudyStats>("get_study_stats", { subjectId });
}

// ── Learning path (redesign slice F) ───────────────────────────────────────

/** Stages (one per outline week, mastery-derived) + today's todo counts. */
export function getSubjectPath(subjectId: string): Promise<SubjectPath> {
  return invoke<SubjectPath>("get_subject_path", { subjectId });
}

/** Cards from one week's materials, due-first — the stage-check session. */
export function getWeekCards(
  subjectId: string,
  weekId: string,
  limit?: number,
): Promise<DueCard[]> {
  return invoke<DueCard[]>("get_week_cards", { subjectId, weekId, limit });
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

/** Approved assignment study briefs (with citations) for a subject. */
export function listAssignmentBriefs(subjectId: string): Promise<AssignmentBrief[]> {
  return invoke<AssignmentBrief[]>("list_assignment_briefs", { subjectId });
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

/** Future deadlines within `withinDays`, across all subjects, soonest first —
 * feeds the calm app-wide deadline alert (ADR-0013). Pure read, writes nothing. */
export function upcomingDeadlines(withinDays: number): Promise<DeadlineAlert[]> {
  return invoke<DeadlineAlert[]>("upcoming_deadlines", { withinDays });
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
 * deadlines + unit info/classes + grade-book pre-fill from the assessment
 * overview). Returns the resulting outline. */
export function commitParsedOutline(
  subjectId: string,
  termStart: string | null,
  weeks: ParsedWeek[],
  deadlines: ParsedDeadline[],
  unitInfo: ParsedUnitInfo | null,
): Promise<Outline> {
  return invoke<Outline>("commit_parsed_outline", {
    subjectId,
    termStart,
    weeks,
    deadlines,
    unitInfo,
  });
}

/** Stored unit info for a subject, or null when none was ever imported. */
export function getUnitInfo(subjectId: string): Promise<UnitInfo | null> {
  return invoke<UnitInfo | null>("get_unit_info", { subjectId });
}

// ── Deep unit plan (background pass) ────────────────────────────────────────

/** Start the deep pass over a syllabus the user just imported: unit essentials,
 * the mark map, and per-week detail. Returns as soon as the job is queued —
 * completion arrives as a `unitplan:ready` / `unitplan:error` event, and the
 * result waits in the draft either way. Rejects with `SIDECAR_UNAVAILABLE`. */
export function startUnitPlan(subjectId: string, filePath: string): Promise<void> {
  return invoke<void>("start_unit_plan", { subjectId, filePath });
}

/** The staged deep plan for a subject, or null when there's no draft. */
export function getUnitPlanDraft(subjectId: string): Promise<UnitPlanDraft | null> {
  return invoke<UnitPlanDraft | null>("get_unit_plan_draft", { subjectId });
}

/** Accept the reviewed plan — send what the user edited, not the stored draft.
 * Writes every section in one transaction and clears the draft. */
export function commitUnitPlan(subjectId: string, plan: UnitPlan): Promise<void> {
  return invoke<void>("commit_unit_plan", { subjectId, plan });
}

/** Throw the draft away without writing anything. */
export function dismissUnitPlanDraft(subjectId: string): Promise<void> {
  return invoke<void>("dismiss_unit_plan_draft", { subjectId });
}

export type UnitPlanReady = { subject_id: string };
export type UnitPlanError = { subject_id: string; error: string };

/** Fires when the background deep pass has staged a plan to review. */
export function onUnitPlanReady(handler: (e: UnitPlanReady) => void): Promise<UnlistenFn> {
  return listen<UnitPlanReady>("unitplan:ready", (e) => handler(e.payload));
}

export function onUnitPlanError(handler: (e: UnitPlanError) => void): Promise<UnlistenFn> {
  return listen<UnitPlanError>("unitplan:error", (e) => handler(e.payload));
}

// ── Assignment spec + rubric ────────────────────────────────────────────────

/** AI-parse an assignment spec file into editable requirements/steps. Writes
 * nothing — the result is staged for review; `commitAssignmentSpec` persists. */
export function parseAssignmentSpec(
  subjectId: string,
  deadlineId: string,
  filePath: string,
): Promise<ParsedSpec> {
  return invoke<ParsedSpec>("parse_assignment_spec", { subjectId, deadlineId, filePath });
}

/** AI-parse a rubric file into editable criteria × levels. Writes nothing. */
export function parseRubric(
  subjectId: string,
  deadlineId: string,
  filePath: string,
): Promise<ParsedRubric> {
  return invoke<ParsedRubric>("parse_rubric", { subjectId, deadlineId, filePath });
}

/** Persist a user-confirmed spec in one transaction (overview + items, with
 * checklist state carried across re-uploads; optional due-date update) and add
 * the file to the source library linked to the deadline. Returns the new
 * source — call `ingestSource` on it so briefs can cite the spec. */
export function commitAssignmentSpec(
  subjectId: string,
  deadlineId: string,
  filePath: string,
  spec: ParsedSpec,
  updateDue: boolean,
): Promise<Source> {
  return invoke<Source>("commit_assignment_spec", {
    subjectId,
    deadlineId,
    filePath,
    spec,
    updateDue,
  });
}

/** Persist a user-confirmed rubric (wholesale replace) and add the file to the
 * source library linked to the deadline. Returns the new source. */
export function commitRubric(
  subjectId: string,
  deadlineId: string,
  filePath: string,
  rubric: ParsedRubric,
): Promise<Source> {
  return invoke<Source>("commit_rubric", { subjectId, deadlineId, filePath, rubric });
}

/** Stored assignment detail (overview, checklist items, rubric, file links). */
export function getAssignmentDetail(deadlineId: string): Promise<AssignmentDetail> {
  return invoke<AssignmentDetail>("get_assignment_detail", { deadlineId });
}

/** Toggle one checklist item. */
export function setAssignmentItemDone(itemId: string, done: boolean): Promise<void> {
  return invoke<void>("set_assignment_item_done", { itemId, done });
}

/** Turn one plan step into a todo (source 'ai', no due date). Idempotent:
 * a step already linked to a live todo returns that todo. */
export function addAssignmentStepTodo(itemId: string): Promise<Todo> {
  return invoke<Todo>("add_assignment_step_todo", { itemId });
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

// ── User profile + study windows (redesign slice A) ────────────────────────

/** Read the profile singleton. All fields are null until onboarding sets them. */
export function getProfile(): Promise<UserProfile> {
  return invoke<UserProfile>("get_profile");
}

/** Patch any subset of the profile; omitted fields are left untouched. */
export function updateProfile(patch: Partial<UserProfile>): Promise<UserProfile> {
  return invoke<UserProfile>("update_profile", {
    name: patch.name,
    year: patch.year,
    major: patch.major,
    termStart: patch.term_start,
    termEnd: patch.term_end,
    wakeTime: patch.wake_time,
    sleepTime: patch.sleep_time,
    goal: patch.goal,
  });
}

/** All weekly study windows, ordered by weekday then start time. */
export function listStudyWindows(): Promise<StudyWindow[]> {
  return invoke<StudyWindow[]>("list_study_windows");
}

/** Replace the whole study-window set (the UI edits it as one list). */
export function setStudyWindows(windows: StudyWindowInput[]): Promise<StudyWindow[]> {
  return invoke<StudyWindow[]>("set_study_windows", { windows });
}

/** Device RAM snapshot used to recommend an AI preset. */
export function getSystemInfo(): Promise<SystemInfo> {
  return invoke<SystemInfo>("get_system_info");
}

// ── AI model download (redesign slice A) ───────────────────────────────────

/** Whether the preset's Ollama model is already downloaded. `ollama_running:
 * false` means the local daemon was unreachable (a different problem). */
export type ModelReady = { model: string; ready: boolean; ollama_running: boolean };

export function modelReady(preset: string): Promise<ModelReady> {
  return invoke<ModelReady>("model_ready", { preset });
}

/** Start downloading the preset's model. Returns the job id; progress and
 * completion arrive as `model:*` events. Rejects with `SIDECAR_UNAVAILABLE`
 * or `MODEL_PULL_FAILED: …`. */
export function downloadModel(preset: string): Promise<{ job_id: string }> {
  return invoke<{ job_id: string }>("download_model", { preset });
}

export type ModelProgress = { job_id: string; preset: string; progress: number; step: string };
export type ModelDone = { job_id: string; preset: string };
export type ModelError = { job_id: string; preset: string; error: string };

export function onModelProgress(handler: (e: ModelProgress) => void): Promise<UnlistenFn> {
  return listen<ModelProgress>("model:progress", (e) => handler(e.payload));
}
export function onModelDone(handler: (e: ModelDone) => void): Promise<UnlistenFn> {
  return listen<ModelDone>("model:done", (e) => handler(e.payload));
}
export function onModelError(handler: (e: ModelError) => void): Promise<UnlistenFn> {
  return listen<ModelError>("model:error", (e) => handler(e.payload));
}

// ── Practice tests (subject view redesign) ─────────────────────────────────

/** Start grounded test generation from a subject's (optionally week-scoped)
 * material. Returns the job id; progress arrives as `test:*` events and the
 * finished items ride the `test:done` payload. Items are ephemeral — never
 * persisted. Rejects with `NO_CHUNKS` or `SIDECAR_UNAVAILABLE`. */
export function generateTest(
  subjectId: string,
  weekId: string | null,
  types: TestKind[],
): Promise<{ job_id: string }> {
  return invoke<{ job_id: string }>("generate_test", { subjectId, weekId, types });
}

export type TestProgress = { job_id: string; progress: number; items_generated: number | null };
export type TestDone = { job_id: string; items: TestItem[] };
export type TestError = { job_id: string; error: string };

export function onTestProgress(handler: (e: TestProgress) => void): Promise<UnlistenFn> {
  return listen<TestProgress>("test:progress", (e) => handler(e.payload));
}
export function onTestDone(handler: (e: TestDone) => void): Promise<UnlistenFn> {
  return listen<TestDone>("test:done", (e) => handler(e.payload));
}
export function onTestError(handler: (e: TestError) => void): Promise<UnlistenFn> {
  return listen<TestError>("test:error", (e) => handler(e.payload));
}

/** Journey checkpoint questions: one ephemeral item per requested kind, built
 * only from the chunks the lesson was generated from. Same `test:*` events and
 * posture as `generateTest`. Rejects with `NO_CHUNKS` or `SIDECAR_UNAVAILABLE`. */
export function generateLessonTest(
  subjectId: string,
  lessonId: string,
  types: TestKind[],
): Promise<{ job_id: string }> {
  return invoke<{ job_id: string }>("generate_lesson_test", { subjectId, lessonId, types });
}

/** Grade a free-text answer (short answer / Feynman) against the item's own
 * grounded expected answer. Feedback is ephemeral. */
export function gradeTestAnswer(
  question: string,
  expected: string,
  userAnswer: string,
): Promise<TestGrade> {
  return invoke<TestGrade>("grade_test_answer", { question, expected, userAnswer });
}

// ── Week walkthrough / journey (guided week session) ───────────────────────

/** Start grounded walkthrough generation (overview note + lesson notes) for an
 * outline week. Returns the job id; progress arrives as `walkthrough:*` events.
 * The result is persisted staged (reviewed = 0) for the inline first-read gate;
 * regenerating replaces the week's walkthrough. Rejects with `NO_CHUNKS`,
 * `WEEK_NOT_FOUND` or `SIDECAR_UNAVAILABLE`. */
export function generateWeekWalkthrough(
  subjectId: string,
  weekId: string,
): Promise<{ job_id: string }> {
  return invoke<{ job_id: string }>("generate_week_walkthrough", { subjectId, weekId });
}

export type WalkthroughProgress = {
  job_id: string;
  progress: number;
  items_generated: number | null;
};
export type WalkthroughDone = { job_id: string; items_generated: number };
export type WalkthroughError = { job_id: string; error: string };

export function onWalkthroughProgress(
  handler: (e: WalkthroughProgress) => void,
): Promise<UnlistenFn> {
  return listen<WalkthroughProgress>("walkthrough:progress", (e) => handler(e.payload));
}
export function onWalkthroughDone(handler: (e: WalkthroughDone) => void): Promise<UnlistenFn> {
  return listen<WalkthroughDone>("walkthrough:done", (e) => handler(e.payload));
}
export function onWalkthroughError(handler: (e: WalkthroughError) => void): Promise<UnlistenFn> {
  return listen<WalkthroughError>("walkthrough:error", (e) => handler(e.payload));
}

/** The week's walkthrough with lessons and journey progress, or null if none
 * has been generated yet. */
export function getWeekWalkthrough(
  subjectId: string,
  weekId: string,
): Promise<WeekWalkthrough | null> {
  return invoke<WeekWalkthrough | null>("get_week_walkthrough", { subjectId, weekId });
}

/** Inline gate: the user read the overview note and kept it (law #2). */
export function approveWalkthroughOverview(walkthroughId: string): Promise<void> {
  return invoke("approve_walkthrough_overview", { walkthroughId });
}

/** Inline gate: the user read this lesson's note and kept it (law #2). */
export function approveWalkthroughLesson(lessonId: string): Promise<void> {
  return invoke("approve_walkthrough_lesson", { lessonId });
}

/** Journey progress: the lesson checkpoint (note + questions) is done. */
export function completeWalkthroughLesson(lessonId: string): Promise<void> {
  return invoke("complete_walkthrough_lesson", { lessonId });
}

/** Journey progress: the whole journey (incl. the recall session) is done. */
export function completeWalkthrough(walkthroughId: string): Promise<void> {
  return invoke("complete_walkthrough", { walkthroughId });
}

/** Discard the walkthrough (reject/regenerate primitive). */
export function deleteWeekWalkthrough(walkthroughId: string): Promise<void> {
  return invoke("delete_week_walkthrough", { walkthroughId });
}

/** Ask a question grounded in the subject's indexed sources (RAG Q&A).
 *  Pass recent turns as `history` so follow-ups resolve "it"/"that".
 *  Rejects with `NO_CHUNKS` when no sources have been ingested yet, or
 *  `SIDECAR_UNAVAILABLE` when Ollama is not reachable. */
export function chatMessage(
  subjectId: string,
  question: string,
  history: ChatHistoryTurn[] = [],
): Promise<ChatMessageResponse> {
  return invoke<ChatMessageResponse>("chat_message", { subjectId, question, history });
}

export function getKnowledgeMap(subjectId: string): Promise<ConceptEntry[]> {
  return invoke<ConceptEntry[]>("get_knowledge_map", { subjectId });
}

// ── Calendar events + todos (redesign slice D) ─────────────────────────────

/** Events with `start_at` in [from, to). Omit both for everything. */
export function listEvents(from?: string, to?: string): Promise<CalendarEvent[]> {
  return invoke<CalendarEvent[]>("list_events", { from, to });
}

/** Create (id omitted) or update (id given) an event; returns the row. */
export function upsertEvent(event: {
  id?: string;
  subject_id?: string | null;
  title: string;
  start_at: string;
  end_at: string;
  kind: EventKind;
  kind_label?: string | null;
  color?: string | null;
  all_day?: boolean;
  recurrence_group_id?: string | null;
  status?: EventStatus;
}): Promise<CalendarEvent> {
  return invoke<CalendarEvent>("upsert_event", {
    id: event.id,
    subjectId: event.subject_id,
    title: event.title,
    startAt: event.start_at,
    endAt: event.end_at,
    kind: event.kind,
    kindLabel: event.kind_label,
    color: event.color,
    allDay: event.all_day ?? false,
    recurrenceGroupId: event.recurrence_group_id,
    status: event.status,
  });
}

export function deleteEventGroup(groupId: string): Promise<void> {
  return invoke<void>("delete_event_group", { groupId });
}

/** Drag-drop reschedule: change only the times. */
export function moveEvent(id: string, startAt: string, endAt: string): Promise<CalendarEvent> {
  return invoke<CalendarEvent>("move_event", { id, startAt, endAt });
}

/** Mark planned/done/moved. */
export function setEventStatus(id: string, status: EventStatus): Promise<CalendarEvent> {
  return invoke<CalendarEvent>("set_event_status", { id, status });
}

export function deleteEvent(id: string): Promise<void> {
  return invoke<void>("delete_event", { id });
}

/** All todos: open items first (by due date), done items last. */
export function listTodos(): Promise<Todo[]> {
  return invoke<Todo[]>("list_todos");
}

export function createTodo(todo: {
  subject_id?: string | null;
  title: string;
  due?: string | null;
  kind?: string;
}): Promise<Todo> {
  return invoke<Todo>("create_todo", {
    subjectId: todo.subject_id,
    title: todo.title,
    due: todo.due,
    kind: todo.kind,
  });
}

/** Update a todo's editable fields (Todos manager detail pane). `null` clears a
 * field; clearing `due` also removes its mirrored calendar event. */
export function updateTodo(todo: {
  id: string;
  subject_id?: string | null;
  title: string;
  notes?: string | null;
  due?: string | null;
  repeat?: TodoRepeat | null;
}): Promise<Todo> {
  return invoke<Todo>("update_todo", {
    id: todo.id,
    subjectId: todo.subject_id ?? null,
    title: todo.title,
    notes: todo.notes ?? null,
    due: todo.due ?? null,
    repeat: todo.repeat ?? null,
  });
}

export function setTodoDone(id: string, done: boolean): Promise<Todo> {
  return invoke<Todo>("set_todo_done", { id, done });
}

export function deleteTodo(id: string): Promise<void> {
  return invoke<void>("delete_todo", { id });
}

// ── Notes app (OneNote-style user notes) ───────────────────────────────────

/** All note folders (Quick notes, then subject folders, then user folders).
 * Auto-ensures the Quick + per-subject folders server-side. */
export function listNoteFolders(): Promise<NoteFolder[]> {
  return invoke<NoteFolder[]>("list_note_folders");
}

export function createNoteFolder(name: string, parentId?: string | null): Promise<NoteFolder> {
  return invoke<NoteFolder>("create_note_folder", { name, parentId: parentId ?? null });
}

export function renameNoteFolder(id: string, name: string): Promise<NoteFolder> {
  return invoke<NoteFolder>("rename_note_folder", { id, name });
}

export function deleteNoteFolder(id: string): Promise<void> {
  return invoke<void>("delete_note_folder", { id });
}

export function listUserNotes(folderId: string): Promise<UserNote[]> {
  return invoke<UserNote[]>("list_user_notes", { folderId });
}

export function getNote(id: string): Promise<UserNote> {
  return invoke<UserNote>("get_note", { id });
}

export function createNote(folderId: string, title?: string | null): Promise<UserNote> {
  return invoke<UserNote>("create_note", { folderId, title: title ?? null });
}

export function updateNote(id: string, title: string, content: string): Promise<UserNote> {
  return invoke<UserNote>("update_note", { id, title, content });
}

export function moveNote(id: string, folderId: string): Promise<UserNote> {
  return invoke<UserNote>("move_note", { id, folderId });
}

export function deleteNote(id: string): Promise<void> {
  return invoke<void>("delete_note", { id });
}

/** Save a quick capture from the top-bar popover into the Quick notes folder. */
export function createQuickNote(content: string, title?: string | null): Promise<UserNote> {
  return invoke<UserNote>("create_quick_note", { content, title: title ?? null });
}

// ── AI week scheduler (redesign slice E) ───────────────────────────────────

/** Ask the rule-based planner for a week proposal. Writes nothing — pair with
 * `acceptSchedule` after the user reviews (law #2). `weekStart` = ISO date of
 * the Monday to plan. Rejects with `SIDECAR_UNAVAILABLE`. */
export function proposeSchedule(weekStart: string): Promise<SchedulePlan> {
  return invoke<SchedulePlan>("propose_schedule", { weekStart });
}

/** Persist the approved parts of a proposal: sessions become `origin:"ai"`
 * events each with a linked todo; moves reschedule the missed event. */
export function acceptSchedule(
  sessions: ProposedSession[],
  moves: ProposedMove[],
): Promise<void> {
  return invoke<void>("accept_schedule", { sessions, moves });
}

/** Record that the user dismissed a proposed session, so the planner steers
 * future proposals away from that time-of-day (workstream 3, ADR-0013).
 * Best-effort and ordering-only — it writes no event and the accept gate stays
 * the sole writer of real sessions (law #2). */
export function dismissProposal(session: ProposedSession): Promise<void> {
  return invoke<void>("dismiss_proposal", { session });
}

/** Offer a different time for one proposed `session` the user can't make.
 * `others` are the other still-pending proposals, passed so the alternative
 * never collides with them. Writes nothing (law #2); resolves to `null` when the
 * week is fully booked and there's no other time to suggest. */
export function resuggestSession(
  session: ProposedSession,
  weekStart: string,
  others: ProposedSession[],
): Promise<ProposedSession | null> {
  return invoke<ProposedSession | null>("resuggest_session", { session, weekStart, others });
}

// ── Pet companion + Ollama lifecycle (redesign slice B) ────────────────────

/** One pet message: routed to lessons (RAG, cited) or app help; out-of-scope
 * comes back as `refusal`. Recent turns in `history` let follow-ups route and
 * answer correctly. Rejects with `SIDECAR_UNAVAILABLE` or
 * `OLLAMA_UNAVAILABLE` while the local AI is still starting. */
export function petMessage(
  question: string,
  subjectId?: string | null,
  history: ChatHistoryTurn[] = [],
): Promise<PetReply> {
  return invoke<PetReply>("pet_message", { question, subjectId, history });
}

/** Whether the local Ollama daemon is reachable right now. */
export function ollamaStatus(): Promise<{ ready: boolean }> {
  return invoke<{ ready: boolean }>("ollama_status");
}

/** Lifecycle transitions of the silently-supervised Ollama daemon. */
export type OllamaEvent = { state: "ready" | "starting" | "unavailable" };

export function onOllamaStatus(handler: (e: OllamaEvent) => void): Promise<UnlistenFn> {
  return listen<OllamaEvent>("ollama:status", (e) => handler(e.payload));
}

/** Whether the Ollama engine is installed on this machine (independent of
 * whether the daemon is currently running). */
export function ollamaInstalled(): Promise<boolean> {
  return invoke<boolean>("ollama_installed");
}

/** Download and run Ollama's official installer. Resolves immediately; progress
 * and completion arrive as `ollama-install:*` events. Once installed the daemon
 * supervisor brings Ollama up on its own. */
export function installOllama(): Promise<void> {
  return invoke<void>("install_ollama");
}

export type OllamaInstallProgress = { progress: number; step: string };

export function onOllamaInstallProgress(
  handler: (e: OllamaInstallProgress) => void,
): Promise<UnlistenFn> {
  return listen<OllamaInstallProgress>("ollama-install:progress", (e) => handler(e.payload));
}
export function onOllamaInstallDone(handler: () => void): Promise<UnlistenFn> {
  return listen("ollama-install:done", () => handler());
}
export function onOllamaInstallError(handler: (error: string) => void): Promise<UnlistenFn> {
  return listen<{ error: string }>("ollama-install:error", (e) => handler(e.payload.error));
}

/** A grounded hierarchical mind map of everything in one week's material. */
export function generateDiagram(subjectId: string, weekId: string): Promise<DiagramResponse> {
  return invoke<DiagramResponse>("generate_diagram", { subjectId, weekId });
}
