import { useState, type ReactNode } from "react";
import { CalendarBlank, FolderOpen, PawPrint, Sparkle, Tree } from "@phosphor-icons/react";
import { Button, LeafMotif, Modal } from "../../components";
import styles from "./TutorialModal.module.css";

type Slide = {
  icon: ReactNode;
  title: string;
  body: ReactNode;
};

/** A calm, skippable tour of the main flow. Content only — no live UI to anchor
 * to, so it stays low-overwhelm and never blocks (every slide can be skipped). */
const SLIDES: Slide[] = [
  {
    icon: <Tree weight="fill" />,
    title: "Welcome to your study forest",
    body: (
      <>
        Arbora turns your own documents and lectures into <strong>grounded, cited</strong> notes,
        flashcards, and quizzes — then helps you actually review them. Here's the quick tour.
      </>
    ),
  },
  {
    icon: <FolderOpen weight="fill" />,
    title: "Start with your subjects",
    body: (
      <>
        From <strong>Home</strong>, add a subject and drop in its readings, slides, or lecture
        recordings. Everything Arbora makes is built only from your sources, and every item links
        back to the exact page or timestamp.
      </>
    ),
  },
  {
    icon: <Sparkle weight="fill" />,
    title: "Generate, then approve",
    body: (
      <>
        Ask Arbora to draft notes, flashcards, or a quiz for a subject. Nothing is trusted until you
        say so — you <strong>review each item</strong> before it becomes part of your deck.
      </>
    ),
  },
  {
    icon: <CalendarBlank weight="fill" />,
    title: "Plan a calm week",
    body: (
      <>
        The <strong>Calendar</strong> lays out your week. Drag to block study time, set deadlines,
        and let <em>“AI plan this week”</em> suggest sessions inside your free windows — always
        suggestions, never booked without you.
      </>
    ),
  },
  {
    icon: <PawPrint weight="fill" />,
    title: "Review, and grow at your pace",
    body: (
      <>
        Arbora resurfaces cards with spaced repetition, just as you're about to forget — short
        sessions are enough. Your tree grows as you study and <strong>never dies or shrinks</strong>.
        No streaks to break. Everything stays on your device.
      </>
    ),
  },
];

/** First-run walkthrough shown once, right after onboarding. */
export function TutorialModal({ open, onFinish }: { open: boolean; onFinish: () => void }) {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const isFirst = index === 0;
  const isLast = index === SLIDES.length - 1;

  function next() {
    if (isLast) onFinish();
    else setIndex((i) => i + 1);
  }

  return (
    <Modal
      open={open}
      onClose={onFinish}
      title="How Arbora works"
      size="sm"
      meta={
        <span className={styles.stepMeta}>
          <span className={styles.stepLeaves} aria-hidden="true">
            {SLIDES.map((_, i) => (
              <LeafMotif
                key={i}
                size={13}
                className={i <= index ? styles.stepLeafGrown : styles.stepLeaf}
              />
            ))}
          </span>
          {index + 1} / {SLIDES.length}
        </span>
      }
      footer={
        <div className={styles.footer}>
          {isLast ? (
            <span />
          ) : (
            <Button variant="ghost" onClick={onFinish}>
              Skip tour
            </Button>
          )}
          <div className={styles.footerRight}>
            {!isFirst && (
              <Button variant="secondary" onClick={() => setIndex((i) => i - 1)}>
                Back
              </Button>
            )}
            <Button variant="primary" onClick={next}>
              {isLast ? "Start exploring" : "Next"}
            </Button>
          </div>
        </div>
      }
    >
      <div className={styles.slide} key={index}>
        <div className={styles.icon} aria-hidden="true">
          {slide.icon}
        </div>
        <h3 className={styles.slideTitle}>{slide.title}</h3>
        <p className={styles.slideBody}>{slide.body}</p>
      </div>
    </Modal>
  );
}
