/**
 * Mock fixtures for the Phase 3 UI-first build (Workstream F).
 *
 * Shapes match src/lib/types.ts (the IPC contract) exactly, so when the backend
 * lands these get replaced by real `invoke()` results with no component changes.
 * Content is illustrative but realistic; every generated item carries a citation
 * (Law #1) so grounding UI can be exercised end-to-end.
 */
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
  TreeData,
} from "../lib/types";

// ── Subjects (S-01) ───────────────────────────────────────────────────────
export const subjects: Subject[] = [
  { id: "sub-bio", name: "Biology 12", color: "#4A7C59", created_at: "2026-05-02T09:00:00Z" },
  { id: "sub-chem", name: "Organic Chemistry", color: "#5A7D9A", created_at: "2026-05-10T09:00:00Z" },
  { id: "sub-hist", name: "Modern History", color: "#C9A227", created_at: "2026-06-18T09:00:00Z" },
];

// ── Sources (S-02 Sources) — every ingest state represented ────────────────
export const sourcesBySubject: Record<string, Source[]> = {
  "sub-bio": [
    {
      id: "src-bio-1",
      subject_id: "sub-bio",
      type: "pdf",
      title: "Chapter 1 — Cells.pdf",
      file_path: "/docs/bio/ch1-cells.pdf",
      ingest_state: "processed",
      page_count: 42,
      chunk_count: 128,
      added_at: "2026-05-02T09:05:00Z",
    },
    {
      id: "src-bio-2",
      subject_id: "sub-bio",
      type: "slide",
      title: "Lecture week 2.pptx",
      file_path: "/docs/bio/lecture-w2.pptx",
      ingest_state: "processed",
      page_count: 30,
      chunk_count: 95,
      added_at: "2026-05-09T09:05:00Z",
    },
    {
      id: "src-bio-3",
      subject_id: "sub-bio",
      type: "audio",
      title: "Recording session 3.mp3",
      file_path: "/docs/bio/rec-3.mp3",
      ingest_state: "processing",
      progress: 0.6,
      step: "transcribing",
      added_at: "2026-06-24T18:00:00Z",
    },
    {
      id: "src-bio-4",
      subject_id: "sub-bio",
      type: "pdf",
      title: "Lab handout — Osmosis.pdf",
      file_path: "/docs/bio/osmosis.pdf",
      ingest_state: "error",
      error: "Could not parse PDF — the file appears to be a scanned image without text.",
      added_at: "2026-06-24T19:00:00Z",
    },
  ],
  "sub-chem": [
    {
      id: "src-chem-1",
      subject_id: "sub-chem",
      type: "pdf",
      title: "Alkenes & Alkynes.pdf",
      file_path: "/docs/chem/alkenes.pdf",
      ingest_state: "processed",
      page_count: 18,
      chunk_count: 54,
      added_at: "2026-05-11T09:05:00Z",
    },
    {
      id: "src-chem-2",
      subject_id: "sub-chem",
      type: "audio",
      title: "Tutorial — Reaction mechanisms.m4a",
      file_path: "/docs/chem/mechanisms.m4a",
      ingest_state: "queued",
      added_at: "2026-06-25T08:00:00Z",
    },
  ],
  "sub-hist": [],
};

// ── Citations reused below ────────────────────────────────────────────────
const earCite = {
  source_id: "src-bio-2",
  source_title: "Lecture week 2.pptx",
  location: { type: "page" as const, page: 5 },
  excerpt: "the eardrum vibrates to transmit sound waves into the middle ear",
};
const cellCite = {
  source_id: "src-bio-1",
  source_title: "Chapter 1 — Cells.pdf",
  location: { type: "page" as const, page: 12 },
  excerpt: "mitochondria are the site of aerobic respiration, producing ATP",
};
const recCite = {
  source_id: "src-bio-3",
  source_title: "Recording session 3.mp3",
  location: { type: "timestamp" as const, timestamp_ms: 184000 },
  excerpt: "osmosis is the net movement of water across a semipermeable membrane",
};

// ── Review queue (S-05) — mixed item types, all cited ─────────────────────
export const reviewQueueBySubject: Record<string, ReviewItem[]> = {
  "sub-bio": [
    {
      kind: "card",
      id: "rev-card-1",
      subject_id: "sub-bio",
      front: "What is the function of the eardrum?",
      back: "It vibrates to transmit sound waves into the middle ear.",
      explanation:
        "The eardrum (tympanic membrane) is a thin membrane separating the outer and middle ear; incoming sound waves set it vibrating, passing energy to the ossicles.",
      source_ref: earCite,
      reviewed: false,
    },
    {
      kind: "card",
      id: "rev-card-2",
      subject_id: "sub-bio",
      front: "Where does aerobic respiration occur in the cell?",
      back: "In the mitochondria.",
      explanation:
        "Mitochondria are the site of aerobic respiration, where glucose is broken down with oxygen to produce ATP.",
      source_ref: cellCite,
      reviewed: false,
    },
    {
      kind: "quiz",
      id: "rev-quiz-1",
      subject_id: "sub-bio",
      question: "Osmosis is best described as the movement of…",
      options: [
        "solutes across a membrane against a gradient",
        "water across a semipermeable membrane down its gradient",
        "ions through protein channels using ATP",
        "gases between alveoli and blood",
      ],
      answer_index: 1,
      explanation:
        "Osmosis is the passive net movement of water across a semipermeable membrane from low to high solute concentration.",
      source_ref: recCite,
      reviewed: false,
    },
    {
      kind: "note",
      id: "rev-note-1",
      subject_id: "sub-bio",
      format: "outline",
      content:
        "## The middle ear\n- Ossicles: malleus, incus, stapes\n- Amplify and transmit vibration from the eardrum to the oval window\n- Eustachian tube equalises pressure",
      source_refs: [earCite],
      reviewed: false,
    },
  ],
  "sub-chem": [
    {
      kind: "card",
      id: "rev-card-c1",
      subject_id: "sub-chem",
      front: "What characterises an addition reaction of an alkene?",
      back: "The C=C double bond opens and two atoms/groups add across it.",
      explanation:
        "Alkenes undergo addition because the π bond is comparatively weak; electrophiles add across the double bond, converting it to a single bond.",
      source_ref: {
        source_id: "src-chem-1",
        source_title: "Alkenes & Alkynes.pdf",
        location: { type: "page", page: 7 },
        excerpt: "the double bond opens and atoms add across the two carbons",
      },
      reviewed: false,
    },
  ],
  "sub-hist": [],
};

// ── Approved content (S-02 Content) ───────────────────────────────────────
export const cardsBySubject: Record<string, Card[]> = {
  "sub-bio": [
    {
      id: "card-1",
      subject_id: "sub-bio",
      front: "What is the role of ribosomes?",
      back: "They synthesise proteins by translating mRNA.",
      explanation: "Ribosomes read mRNA codons and assemble the corresponding amino-acid chain.",
      source_ref: cellCite,
      reviewed: true,
    },
    {
      id: "card-2",
      subject_id: "sub-bio",
      front: "What is the function of the eardrum?",
      back: "It vibrates to transmit sound waves into the middle ear.",
      explanation: "A thin membrane that passes sound energy to the ossicles.",
      source_ref: earCite,
      reviewed: true,
    },
  ],
  "sub-chem": [],
  "sub-hist": [],
};

export const quizBySubject: Record<string, QuizItem[]> = {
  "sub-bio": [
    {
      id: "quiz-1",
      subject_id: "sub-bio",
      question: "Which organelle produces most of the cell's ATP?",
      options: ["Nucleus", "Mitochondrion", "Ribosome", "Golgi apparatus"],
      answer_index: 1,
      explanation: "Mitochondria carry out aerobic respiration to produce ATP.",
      source_ref: cellCite,
      reviewed: true,
    },
  ],
  "sub-chem": [],
  "sub-hist": [],
};

export const notesBySubject: Record<string, Note[]> = {
  "sub-bio": [
    {
      id: "note-1",
      subject_id: "sub-bio",
      format: "cornell",
      content:
        "## The cell\n**Cue:** What makes a cell eukaryotic?\n- Membrane-bound nucleus\n- Organelles (mitochondria, ER, Golgi)\n\n**Summary:** Eukaryotic cells compartmentalise function into membrane-bound organelles.",
      source_refs: [cellCite],
      reviewed: true,
    },
  ],
  "sub-chem": [],
  "sub-hist": [],
};

// ── Study (S-06) ──────────────────────────────────────────────────────────
export const dueCardsBySubject: Record<string, DueCard[]> = {
  "sub-bio": [
    {
      card: cardsBySubject["sub-bio"][1],
      schedule: {
        card_id: "card-2",
        due: "2026-06-25T00:00:00Z",
        stability: 8.2,
        difficulty: 5.1,
        state: "review",
        last_review: "2026-06-18T00:00:00Z",
      },
    },
    {
      card: cardsBySubject["sub-bio"][0],
      schedule: {
        card_id: "card-1",
        due: "2026-06-25T00:00:00Z",
        stability: 3.4,
        difficulty: 6.0,
        state: "learning",
        last_review: "2026-06-23T00:00:00Z",
      },
    },
  ],
  "sub-chem": [],
  "sub-hist": [],
};

export const studyStatsBySubject: Record<string, StudyStats> = {
  "sub-bio": { due_today: 8, due_this_week: 22, mastered: 47, streak: 5 },
  "sub-chem": { due_today: 3, due_this_week: 9, mastered: 12, streak: 2 },
  "sub-hist": { due_today: 0, due_this_week: 0, mastered: 0, streak: 0 },
};

// ── Planning (S-07) ───────────────────────────────────────────────────────
export const deadlinesBySubject: Record<string, Deadline[]> = {
  "sub-bio": [
    { id: "dl-1", subject_id: "sub-bio", title: "Midterm exam", due_at: "2026-07-21T09:00:00Z", type: "exam" },
    { id: "dl-2", subject_id: "sub-bio", title: "Lab report due", due_at: "2026-07-15T23:59:00Z", type: "assignment" },
    { id: "dl-3", subject_id: "sub-bio", title: "Final exam", due_at: "2026-08-12T09:00:00Z", type: "exam" },
  ],
  "sub-chem": [],
  "sub-hist": [
    { id: "dl-h1", subject_id: "sub-hist", title: "Essay draft", due_at: "2026-06-30T23:59:00Z", type: "assignment" },
  ],
};

export const gradesBySubject: Record<string, Grade[]> = {
  "sub-bio": [
    { id: "g-1", subject_id: "sub-bio", name: "Midterm exam", category: "Midterm", score: 75, max_score: 100, weight: 0.3 },
    { id: "g-2", subject_id: "sub-bio", name: "HW1", category: "Assignment", score: 9, max_score: 10, weight: 0.1 },
    { id: "g-3", subject_id: "sub-bio", name: "Final exam", category: "Final", score: null, max_score: 100, weight: 0.6 },
  ],
  "sub-chem": [],
  "sub-hist": [],
};

export const gradeSummaryBySubject: Record<string, GradeSummary> = {
  "sub-bio": {
    current_average: 82.5,
    gpa: 3.5,
    what_if: [
      { label: "Final = 70", gpa: 3.2 },
      { label: "Final = 85", gpa: 3.7 },
      { label: "Final = 95", gpa: 4.0 },
    ],
  },
  "sub-chem": { current_average: null, gpa: null, what_if: [] },
  "sub-hist": { current_average: null, gpa: null, what_if: [] },
};

// ── Dashboard / Tree (S-08) ───────────────────────────────────────────────
export const treeBySubject: Record<string, TreeData> = {
  "sub-bio": { mastery_pct: 0.67, concepts_total: 70, concepts_mastered: 47, concepts_learning: 23 },
  "sub-chem": { mastery_pct: 0.28, concepts_total: 43, concepts_mastered: 12, concepts_learning: 18 },
  "sub-hist": { mastery_pct: 0, concepts_total: 0, concepts_mastered: 0, concepts_learning: 0 },
};

export const dashboardBySubject: Record<string, SubjectDashboard> = {
  "sub-bio": {
    subject_id: "sub-bio",
    tree: treeBySubject["sub-bio"],
    stats: studyStatsBySubject["sub-bio"],
    next_deadline: deadlinesBySubject["sub-bio"][1],
  },
  "sub-chem": {
    subject_id: "sub-chem",
    tree: treeBySubject["sub-chem"],
    stats: studyStatsBySubject["sub-chem"],
    next_deadline: null,
  },
  "sub-hist": {
    subject_id: "sub-hist",
    tree: treeBySubject["sub-hist"],
    stats: studyStatsBySubject["sub-hist"],
    next_deadline: deadlinesBySubject["sub-hist"][0],
  },
};

/** All six tree stages for the component gallery / QA. */
export const treeStages: TreeData[] = [
  { mastery_pct: 0, concepts_total: 0, concepts_mastered: 0, concepts_learning: 0 },
  { mastery_pct: 0.12, concepts_total: 20, concepts_mastered: 3, concepts_learning: 8 },
  { mastery_pct: 0.32, concepts_total: 40, concepts_mastered: 13, concepts_learning: 14 },
  { mastery_pct: 0.55, concepts_total: 60, concepts_mastered: 33, concepts_learning: 16 },
  { mastery_pct: 0.8, concepts_total: 80, concepts_mastered: 64, concepts_learning: 12 },
  { mastery_pct: 0.97, concepts_total: 100, concepts_mastered: 97, concepts_learning: 3 },
];
