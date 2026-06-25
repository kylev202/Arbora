/**
 * Mock IPC layer (Workstream F2). Same function names/shapes as the real
 * src/lib/ipc.ts will expose, but resolves fixtures after a simulated delay so
 * screens exercise their loading states. Phase 3 calls THIS, never `invoke()`.
 *
 * Swap-out plan: when the backend lands, each function here gets a sibling in
 * src/lib/ipc.ts with an identical signature, and features import from there.
 */
import {
  cardsBySubject,
  dashboardBySubject,
  deadlinesBySubject,
  dueCardsBySubject,
  gradeSummaryBySubject,
  gradesBySubject,
  notesBySubject,
  quizBySubject,
  reviewQueueBySubject,
  sourcesBySubject,
  studyStatsBySubject,
  subjects,
} from "./fixtures";
import type {
  Card,
  Deadline,
  DueCard,
  Grade,
  GradeSummary,
  Note,
  QuizItem,
  ReviewItem,
  Source,
  StudyStats,
  Subject,
  SubjectDashboard,
} from "../lib/types";

/** Simulated loopback latency. */
function delay<T>(value: T, ms = 320): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// Deep-ish clone so screens that mutate locally don't corrupt the fixtures.
const clone = <T>(v: T): T => structuredClone(v);

export const mockApi = {
  listSubjects: (): Promise<Subject[]> => delay(clone(subjects)),

  getSubject: (id: string): Promise<Subject | undefined> =>
    delay(clone(subjects.find((s) => s.id === id))),

  listSources: (subjectId: string): Promise<Source[]> =>
    delay(clone(sourcesBySubject[subjectId] ?? [])),

  getReviewQueue: (subjectId: string): Promise<ReviewItem[]> =>
    delay(clone(reviewQueueBySubject[subjectId] ?? [])),

  listCards: (subjectId: string): Promise<Card[]> =>
    delay(clone(cardsBySubject[subjectId] ?? [])),

  listQuiz: (subjectId: string): Promise<QuizItem[]> =>
    delay(clone(quizBySubject[subjectId] ?? [])),

  listNotes: (subjectId: string): Promise<Note[]> =>
    delay(clone(notesBySubject[subjectId] ?? [])),

  getDueCards: (subjectId: string): Promise<DueCard[]> =>
    delay(clone(dueCardsBySubject[subjectId] ?? [])),

  getStudyStats: (subjectId: string): Promise<StudyStats> =>
    delay(clone(studyStatsBySubject[subjectId] ?? { due_today: 0, due_this_week: 0, mastered: 0, streak: 0 })),

  listDeadlines: (subjectId: string): Promise<Deadline[]> =>
    delay(clone(deadlinesBySubject[subjectId] ?? [])),

  listGrades: (subjectId: string): Promise<Grade[]> =>
    delay(clone(gradesBySubject[subjectId] ?? [])),

  getGradeSummary: (subjectId: string): Promise<GradeSummary> =>
    delay(clone(gradeSummaryBySubject[subjectId] ?? { current_average: null, gpa: null, what_if: [] })),

  getSubjectDashboard: (subjectId: string): Promise<SubjectDashboard> =>
    delay(clone(dashboardBySubject[subjectId])),
};
