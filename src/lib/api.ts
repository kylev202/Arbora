/**
 * Single data-access facade for the UI.
 *
 * Every method calls the real Rust core (`src/lib/ipc.ts`). Phase 4 wired the
 * backend slice by slice behind this seam; with Slice 4 complete the mock
 * fixtures are gone. Call sites import `api` and never touch `invoke` directly.
 */
import * as ipc from "./ipc";

export const api = {
  // ── Slice 0 — Subjects (live) ──
  listSubjects: ipc.listSubjects,
  getSubject: ipc.getSubject,
  createSubject: ipc.createSubject,
  updateSubject: ipc.updateSubject,
  deleteSubject: ipc.deleteSubject,

  // ── Slice 1 — Sources + ingest (live) ──
  listSources: ipc.listSources,
  addSource: ipc.addSource,
  getSource: ipc.getSource,
  renameSource: ipc.renameSource,
  deleteSource: ipc.deleteSource,
  ingestSource: ipc.ingestSource,
  getSourceChunks: ipc.getSourceChunks,
  listAnnotations: ipc.listAnnotations,
  createAnnotation: ipc.createAnnotation,
  deleteAnnotation: ipc.deleteAnnotation,

  // ── Drive folders (user-managed source organization) ──
  listSourceFolders: ipc.listSourceFolders,
  createSourceFolder: ipc.createSourceFolder,
  renameSourceFolder: ipc.renameSourceFolder,
  deleteSourceFolder: ipc.deleteSourceFolder,
  listFolderSources: ipc.listFolderSources,
  setSourceFolder: ipc.setSourceFolder,

  // ── Slice 2 — Generate + review gate (live) ──
  generateContent: ipc.generateContent,
  generateAssignmentBrief: ipc.generateAssignmentBrief,
  getReviewQueue: ipc.getReviewQueue,
  approveCard: ipc.approveCard,
  rejectCard: ipc.rejectCard,
  approveQuizItem: ipc.approveQuizItem,
  rejectQuizItem: ipc.rejectQuizItem,
  approveNote: ipc.approveNote,
  rejectNote: ipc.rejectNote,
  approveBrief: ipc.approveBrief,
  rejectBrief: ipc.rejectBrief,

  // ── Slice 3 — FSRS study loop (live) ──
  getDueCards: ipc.getDueCards,
  getDueCardsInterleaved: ipc.getDueCardsInterleaved,
  getDueCardsPrioritized: ipc.getDueCardsPrioritized,
  submitCardReview: ipc.submitCardReview,
  getStudyStats: ipc.getStudyStats,

  // ── Slice 4a — Content browsing + dashboard (live) ──
  listCards: ipc.listCards,
  listQuiz: ipc.listQuiz,
  listNotes: ipc.listNotes,
  listAssignmentBriefs: ipc.listAssignmentBriefs,
  getSubjectDashboard: ipc.getSubjectDashboard,

  // ── Slice 4b — Plan: deadlines + grade book (live) ──
  listDeadlines: ipc.listDeadlines,
  createDeadline: ipc.createDeadline,
  deleteDeadline: ipc.deleteDeadline,
  listGrades: ipc.listGrades,
  createGrade: ipc.createGrade,
  deleteGrade: ipc.deleteGrade,
  getGradeSummary: ipc.getGradeSummary,

  // ── Unit outline / weeks (semester planning) ──
  getOutline: ipc.getOutline,
  setOutline: ipc.setOutline,
  updateWeek: ipc.updateWeek,
  assignSourceWeek: ipc.assignSourceWeek,
  setAssignmentCoverage: ipc.setAssignmentCoverage,
  getAssignmentCoverage: ipc.getAssignmentCoverage,
  getPriorityQueue: ipc.getPriorityQueue,
  parseOutlineFile: ipc.parseOutlineFile,
  commitParsedOutline: ipc.commitParsedOutline,
  getUnitInfo: ipc.getUnitInfo,

  // ── Assignment spec + rubric ──
  parseAssignmentSpec: ipc.parseAssignmentSpec,
  parseRubric: ipc.parseRubric,
  commitAssignmentSpec: ipc.commitAssignmentSpec,
  commitRubric: ipc.commitRubric,
  getAssignmentDetail: ipc.getAssignmentDetail,
  setAssignmentItemDone: ipc.setAssignmentItemDone,
  addAssignmentStepTodo: ipc.addAssignmentStepTodo,

  // ── Slice 4c — Settings (live) ──
  getSettings: ipc.getSettings,
  updateSettings: ipc.updateSettings,

  // ── Redesign slice A — profile + study windows + device info ──
  getProfile: ipc.getProfile,
  updateProfile: ipc.updateProfile,
  listStudyWindows: ipc.listStudyWindows,
  setStudyWindows: ipc.setStudyWindows,
  getSystemInfo: ipc.getSystemInfo,
  sidecarStatus: ipc.sidecarStatus,
  onSidecarStatus: ipc.onSidecarStatus,
  restartSidecar: ipc.restartSidecar,
  modelReady: ipc.modelReady,
  downloadModel: ipc.downloadModel,
  ollamaInstalled: ipc.ollamaInstalled,
  installOllama: ipc.installOllama,

  // ── Practice tests (subject view redesign) ──
  generateTest: ipc.generateTest,
  generateLessonTest: ipc.generateLessonTest,
  gradeTestAnswer: ipc.gradeTestAnswer,

  // ── Week walkthrough / journey (guided week session) ──
  generateWeekWalkthrough: ipc.generateWeekWalkthrough,
  getWeekWalkthrough: ipc.getWeekWalkthrough,
  approveWalkthroughOverview: ipc.approveWalkthroughOverview,
  approveWalkthroughLesson: ipc.approveWalkthroughLesson,
  completeWalkthroughLesson: ipc.completeWalkthroughLesson,
  completeWalkthrough: ipc.completeWalkthrough,
  deleteWeekWalkthrough: ipc.deleteWeekWalkthrough,

  // ── Phase 6 — RAG Q&A ──
  chatMessage: ipc.chatMessage,

  // ── Redesign slice B — pet companion ──
  petMessage: ipc.petMessage,
  ollamaStatus: ipc.ollamaStatus,

  // ── Redesign slice D — calendar + todos ──
  listEvents: ipc.listEvents,
  upsertEvent: ipc.upsertEvent,
  moveEvent: ipc.moveEvent,
  setEventStatus: ipc.setEventStatus,
  deleteEvent: ipc.deleteEvent,
  deleteEventGroup: ipc.deleteEventGroup,
  listTodos: ipc.listTodos,
  createTodo: ipc.createTodo,
  updateTodo: ipc.updateTodo,
  setTodoDone: ipc.setTodoDone,
  deleteTodo: ipc.deleteTodo,

  // ── Notes app (OneNote-style user notes) ──
  listNoteFolders: ipc.listNoteFolders,
  createNoteFolder: ipc.createNoteFolder,
  renameNoteFolder: ipc.renameNoteFolder,
  deleteNoteFolder: ipc.deleteNoteFolder,
  listUserNotes: ipc.listUserNotes,
  getNote: ipc.getNote,
  createNote: ipc.createNote,
  updateNote: ipc.updateNote,
  moveNote: ipc.moveNote,
  deleteNote: ipc.deleteNote,
  createQuickNote: ipc.createQuickNote,

  // ── Redesign slice E — AI week scheduler (proposals via review) ──
  proposeSchedule: ipc.proposeSchedule,
  acceptSchedule: ipc.acceptSchedule,

  // ── Redesign slice F — learning path ──
  getSubjectPath: ipc.getSubjectPath,
  getWeekCards: ipc.getWeekCards,

  // ── Phase 6 — Knowledge map ──
  getKnowledgeMap: ipc.getKnowledgeMap,

  // ── Phase 6 — Mermaid diagrams ──
  generateDiagram: ipc.generateDiagram,
};
