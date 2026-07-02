import { useEffect, useMemo, useState } from "react";
import { Button, CitationChip, LeafMotif } from "../../components";
import { api } from "../../lib/api";
import type { Card, FSRSRating } from "../../lib/types";
import { ScheduleProposalCard } from "../calendar/ScheduleProposalCard";
import { CELEBRATE_EVENT } from "../pet/Pet";
import styles from "./SessionRecap.module.css";

const MAX_RECAP_ITEMS = 8;

export type ReviewedCard = { card: Card; rating: FSRSRating };

/** Soonest future FSRS due (ISO date) among the session's cards, or null. */
function soonestDue(dues: string[]): string | null {
  const today = new Date().toISOString().split("T")[0];
  const future = dues.map((d) => d.split("T")[0]).filter((d) => d > today);
  if (future.length === 0) return null;
  return future.sort()[0];
}

/**
 * End-of-session recap (§4.4). Grounded BY CONSTRUCTION: everything shown is
 * assembled from the cards just reviewed and their authoritative citations —
 * no generation, no chance to hallucinate, instant on the low preset. Offers
 * one review-ahead session built from the cards' real FSRS dues, through the
 * same accept-gated scheduler path as every AI proposal (law #2).
 */
export function SessionRecap({
  subjectId,
  reviewed,
  nextDues,
  onExit,
  onSeeTree,
}: {
  subjectId: string;
  reviewed: ReviewedCard[];
  nextDues: string[];
  onExit: () => void;
  onSeeTree: () => void;
}) {
  const [proposalState, setProposalState] = useState<"open" | "accepted" | "dismissed">("open");

  // Let the pet cheer once, gently, when a session completes (§1.2 celebrate).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(CELEBRATE_EVENT));
  }, []);

  const remembered = reviewed.filter((r) => r.rating === "good" || r.rating === "easy").length;
  const revisit = reviewed.length - remembered;

  const recapCards = useMemo(() => {
    const seen = new Set<string>();
    const unique: Card[] = [];
    for (const r of reviewed) {
      if (!seen.has(r.card.id)) {
        seen.add(r.card.id);
        unique.push(r.card);
      }
    }
    return unique.slice(0, MAX_RECAP_ITEMS);
  }, [reviewed]);

  const dueDate = soonestDue(nextDues);
  const proposal =
    dueDate === null
      ? null
      : {
          subject_id: subjectId,
          title: "Review this material",
          start_at: `${dueDate}T18:00`,
          end_at: `${dueDate}T18:50`,
          kind: "study",
          reason: "Cards from this session come due around then — a short review locks them in.",
        };

  async function acceptProposal(times: { start_at: string; end_at: string }) {
    if (!proposal) return;
    await api.acceptSchedule([{ ...proposal, ...times }], []);
    setProposalState("accepted");
  }

  return (
    <div className={styles.recap}>
      <h1 className={styles.title}>
        <LeafMotif size={26} className={styles.titleLeaf} /> Nice session
      </h1>
      <p className={styles.counts}>
        {reviewed.length} card{reviewed.length === 1 ? "" : "s"} reviewed · {remembered} remembered
        {revisit > 0 && ` · ${revisit} to revisit soon`}
      </p>

      <section aria-label="What you covered" className={styles.covered}>
        <h2 className={styles.coveredTitle}>What you covered</h2>
        <ul className={styles.list}>
          {recapCards.map((c) => (
            <li key={c.id} className={styles.item}>
              <span className={styles.front}>{c.front}</span>
              <CitationChip source={c.source_ref} />
            </li>
          ))}
        </ul>
        {reviewed.length > recapCards.length && (
          <p className={styles.more}>…and {reviewed.length - recapCards.length} more.</p>
        )}
      </section>

      {proposal && proposalState === "open" && (
        <section aria-label="Review-ahead suggestion" className={styles.proposal}>
          <ScheduleProposalCard
            proposal={proposal}
            onAccept={(times) => void acceptProposal(times)}
            onDismiss={() => setProposalState("dismissed")}
          />
        </section>
      )}
      {proposalState === "accepted" && (
        <p className={styles.accepted} role="status">
          Added to your calendar 🌱
        </p>
      )}

      <div className={styles.actions}>
        <Button variant="primary" onClick={onSeeTree}>
          See your tree
        </Button>
        <Button variant="ghost" onClick={onExit}>
          Done
        </Button>
      </div>
    </div>
  );
}
