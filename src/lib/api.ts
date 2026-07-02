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
  renameSource: ipc.renameSource,
  deleteSource: ipc.deleteSource,
  ingestSource: ipc.ingestSource,

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

  // ── Slice 4c — Settings (live) ──
  getSettings: ipc.getSettings,
  updateSettings: ipc.updateSettings,

  // ── Redesign slice A — profile + study windows + device info ──
  getProfile: ipc.getProfile,
  updateProfile: ipc.updateProfile,
  listStudyWindows: ipc.listStudyWindows,
  setStudyWindows: ipc.setStudyWindows,
  getSystemInfo: ipc.getSystemInfo,

  // ── Slice 4d — Anki export (live) ──
  exportApkg: ipc.exportApkg,

  // ── Phase 6 — RAG Q&A ──
  chatMessage: ipc.chatMessage,

  // ── Phase 6 — Knowledge map ──
  getKnowledgeMap: ipc.getKnowledgeMap,

  // ── Phase 6 — Mermaid diagrams ──
  generateDiagram: ipc.generateDiagram,
};
