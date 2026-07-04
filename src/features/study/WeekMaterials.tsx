import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Cards, Exam, Play } from "@phosphor-icons/react";
import { Button, CitationChip, EmptyState, Tabs, Tag, type TabItem } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import type { DueCard, PathStage } from "../../lib/types";
import { ChatPanel } from "../chat/ChatPanel";
import { DiagramPanel } from "../diagrams/DiagramPanel";
import { JourneyPanel } from "./JourneyPanel";
import styles from "./WeekMaterials.module.css";

type MaterialTab = "journey" | "flashcards" | "test" | "diagram" | "ask";

/**
 * Self-paced materials for one week: Journey (the guided walkthrough — notes,
 * lessons, recall), Flashcards (Arbora's own in-app review loop), Test (varied
 * grounded practice tests), Diagram (flowchart of the week's topic), and Ask AI
 * (grounded chat). One material at a time — sub-tabs keep the page calm.
 */
export function WeekMaterials({ subjectId, week }: { subjectId: string; week: PathStage }) {
  const [tab, setTab] = useState<MaterialTab>("journey");
  const cards = useAsync(() => api.getWeekCards(subjectId, week.week_id, 200), [subjectId, week.week_id]);

  const items: TabItem<MaterialTab>[] = [
    { id: "journey", label: "Journey" },
    { id: "flashcards", label: "Flashcards", badge: cards.data?.length || undefined },
    { id: "test", label: "Test" },
    { id: "diagram", label: "Diagram" },
    { id: "ask", label: "Ask AI" },
  ];

  const weekLabel = `Week ${week.week_number}${week.title ? ` · ${week.title}` : ""}`;

  return (
    <div className={styles.materials}>
      <Tabs items={items} value={tab} onChange={setTab} label={`${weekLabel} materials`} />

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className={styles.panel}>
        {tab === "journey" && <JourneyPanel subjectId={subjectId} week={week} />}
        {tab === "flashcards" && (
          <FlashcardsPanel subjectId={subjectId} week={week} cards={cards.data ?? []} loading={cards.status === "loading"} />
        )}
        {tab === "test" && <TestLauncher subjectId={subjectId} week={week} />}
        {tab === "diagram" && <DiagramPanel subjectId={subjectId} initialTopic={week.title} />}
        {tab === "ask" && <ChatPanel subjectId={subjectId} />}
      </div>
    </div>
  );
}

const MASTERY_TAG: Record<string, { label: string; tone: "mastered" | "learning" | "neutral" }> = {
  review: { label: "Mastered", tone: "mastered" },
  learning: { label: "Learning", tone: "learning" },
  relearning: { label: "Learning", tone: "learning" },
  new: { label: "New", tone: "neutral" },
};

/** Browse the week's approved flashcards (front → reveal back) and start a
 * review session on them — Arbora's own flashcard loop, scheduled by FSRS. */
function FlashcardsPanel({
  subjectId,
  week,
  cards,
  loading,
}: {
  subjectId: string;
  week: PathStage;
  cards: DueCard[];
  loading: boolean;
}) {
  const navigate = useNavigate();
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  if (loading) return <div className={styles.skeleton} aria-hidden="true" />;

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={<Cards />}
        title="No flashcards for this week yet"
        description="Generate flashcards from this week's sources on the Overview page, then approve them in the review gate."
        action={
          <Link to={`/subject/${subjectId}/overview`} className={styles.emptyLink}>
            Go to Overview
          </Link>
        }
      />
    );
  }

  function toggle(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const due = cards.filter((c) => c.schedule.due <= new Date().toISOString()).length;

  return (
    <>
      <div className={styles.flashHead}>
        <p className={styles.flashMeta}>
          {cards.length} card{cards.length === 1 ? "" : "s"}
          {due > 0 && ` · ${due} due for review`}
        </p>
        <Button
          size="sm"
          variant="primary"
          icon={<Play weight="fill" />}
          onClick={() => navigate(`/subject/${subjectId}/study/session?week=${week.week_id}`)}
        >
          Review these flashcards
        </Button>
      </div>
      <ul className={styles.cardList}>
        {cards.map(({ card, schedule }) => {
          const open = revealed.has(card.id);
          const tag = MASTERY_TAG[schedule.state] ?? MASTERY_TAG.new;
          return (
            <li key={card.id}>
              <button
                type="button"
                className={styles.cardItem}
                onClick={() => toggle(card.id)}
                aria-expanded={open}
              >
                <span className={styles.cardFront}>{card.front}</span>
                <Tag tone={tag.tone}>{tag.label}</Tag>
              </button>
              {open && (
                <div className={styles.cardBack}>
                  <p>{card.back}</p>
                  {card.explanation && <p className={styles.cardExplain}>{card.explanation}</p>}
                  <CitationChip source={card.source_ref} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Entry point to the practice-test flow for this week. */
function TestLauncher({ subjectId, week }: { subjectId: string; week: PathStage }) {
  const navigate = useNavigate();
  return (
    <EmptyState
      icon={<Exam />}
      title={`Test yourself on Week ${week.week_number}`}
      description="Pick the question styles you want — short answer, multiple choice, matching, ordering, or explaining in your own words — and Arbora builds a test from this week's material, every question cited."
      action={
        <Button
          variant="primary"
          icon={<Play weight="fill" />}
          onClick={() => navigate(`/subject/${subjectId}/study/test?week=${week.week_id}&label=${encodeURIComponent(`Week ${week.week_number}`)}`)}
        >
          Set up a test
        </Button>
      }
    />
  );
}
