import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Cards, Notebook, Question } from "@phosphor-icons/react";
import { CitationChip, EmptyState, Tabs, type TabItem } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import shared from "./Workspace.module.css";
import styles from "./ContentTab.module.css";

type SubTab = "notes" | "cards" | "quiz";

/** S-02 Content tab — approved notes/cards/quiz, grouped, each one cited. */
export function ContentTab() {
  const { subjectId = "" } = useParams();
  const [tab, setTab] = useState<SubTab>("notes");

  const notes = useAsync(() => api.listNotes(subjectId), [subjectId]);
  const cards = useAsync(() => api.listCards(subjectId), [subjectId]);
  const quiz = useAsync(() => api.listQuiz(subjectId), [subjectId]);
  const review = useAsync(() => api.getReviewQueue(subjectId), [subjectId]);

  const reviewCount = review.data?.length ?? 0;

  const items: TabItem<SubTab>[] = [
    { id: "notes", label: "Notes", badge: notes.data?.length },
    { id: "cards", label: "Cards", badge: cards.data?.length },
    { id: "quiz", label: "Quiz", badge: quiz.data?.length },
  ];

  return (
    <div className="page">
      <div className="screen-header">
        <h1>Content</h1>
      </div>

      {reviewCount > 0 && (
        <Link to={`/subject/${subjectId}/review`} className={styles.reviewBanner}>
          <span>
            <strong>{reviewCount} items</strong> waiting for review before they're saved.
          </span>
          <span className={styles.reviewCta}>
            Open review <ArrowRight weight="bold" />
          </span>
        </Link>
      )}

      <Tabs items={items} value={tab} onChange={setTab} label="Content type" />

      <div
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className={styles.panel}
      >
        {tab === "notes" &&
          (notes.data?.length ? (
            notes.data.map((n) => (
              <article key={n.id} className={shared.card + " " + styles.item}>
                <div className={styles.noteContent}>{n.content}</div>
                <div className={styles.citations}>
                  {n.source_refs.map((ref, i) => (
                    <CitationChip key={i} source={ref} />
                  ))}
                </div>
              </article>
            ))
          ) : (
            <EmptyState icon={<Notebook />} title="No notes yet" description="Generate notes from your sources, then approve them here." />
          ))}

        {tab === "cards" &&
          (cards.data?.length ? (
            cards.data.map((c) => (
              <article key={c.id} className={shared.card + " " + styles.item}>
                <p className={styles.front}>{c.front}</p>
                <p className={styles.back}>{c.back}</p>
                <CitationChip source={c.source_ref} />
              </article>
            ))
          ) : (
            <EmptyState icon={<Cards />} title="No flashcards yet" description="Generate flashcards from your sources, then approve them here." />
          ))}

        {tab === "quiz" &&
          (quiz.data?.length ? (
            quiz.data.map((q) => (
              <article key={q.id} className={shared.card + " " + styles.item}>
                <p className={styles.front}>{q.question}</p>
                <ol className={styles.options}>
                  {q.options.map((opt, i) => (
                    <li key={i} className={i === q.answer_index ? styles.correct : undefined}>
                      {opt}
                    </li>
                  ))}
                </ol>
                <CitationChip source={q.source_ref} />
              </article>
            ))
          ) : (
            <EmptyState icon={<Question />} title="No quiz questions yet" description="Generate a quiz from your sources, then approve it here." />
          ))}
      </div>
    </div>
  );
}
