import { useEffect, useMemo, useState } from "react";
import { Button, CitationChip, LeafMotif } from "../../components";
import { api } from "../../lib/api";
import type { Card, FSRSRating } from "../../lib/types";
import { ScheduleProposalCard } from "../calendar/ScheduleProposalCard";
import { CELEBRATE_EVENT } from "../pet/Pet";
import styles from "./SessionRecap.module.css";

const MAX_RECAP_ITEMS = 8;
const MAX_REWINDS = 2;

export type ReviewedCard = { card: Card; rating: FSRSRating };

/** Up to two future ISO dates to rewind on: the soonest distinct FSRS dues of
 * the session's cards, padded with due+3 days when only one date exists. */
function rewindDates(dues: string[]): string[] {
  const today = new Date().toISOString().split("T")[0];
  const future = [...new Set(dues.map((d) => d.split("T")[0]).filter((d) => d > today))].sort();
  const picked = future.slice(0, MAX_REWINDS);
  if (picked.length === 1) {
    const [y, m, d] = picked[0].split("-").map(Number);
    const later = new Date(y, m - 1, d + 3);
    const mm = String(later.getMonth() + 1).padStart(2, "0");
    const dd = String(later.getDate()).padStart(2, "0");
    picked.push(`${later.getFullYear()}-${mm}-${dd}`);
  }
  return picked;
}

type ProposalState = "open" | "accepted" | "dismissed";

/**
 * End-of-session recap (§4.4). Grounded BY CONSTRUCTION: everything shown is
 * assembled from the cards just reviewed and their authoritative citations —
 * no generation, no chance to hallucinate, instant on the low preset. Lines up
 * one or two "rewind" sessions on the next days, built from the cards' real
 * FSRS dues, through the same accept-gated scheduler path as every AI
 * proposal (law #2). When the session was a pre-week check, `continueTo`
 * offers the jump into this week's material.
 */
export function SessionRecap({
  subjectId,
  reviewed,
  nextDues,
  onExit,
  onSeeTree,
  onContinue,
}: {
  subjectId: string;
  reviewed: ReviewedCard[];
  nextDues: string[];
  onExit: () => void;
  onSeeTree: () => void;
  /** Present when a check session should chain into this week's session. */
  onContinue?: (() => void) | null;
}) {
  const [proposalStates, setProposalStates] = useState<ProposalState[]>([]);

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

  const proposals = useMemo(
    () =>
      rewindDates(nextDues).map((date) => ({
        subject_id: subjectId,
        title: "Rewind this material",
        start_at: `${date}T18:00`,
        end_at: `${date}T18:50`,
        kind: "study",
        reason: "A short rewind around when these cards come due locks them in.",
      })),
    [nextDues, subjectId],
  );

  useEffect(() => {
    setProposalStates(proposals.map(() => "open"));
  }, [proposals]);

  async function acceptProposal(index: number, times: { start_at: string; end_at: string }) {
    await api.acceptSchedule([{ ...proposals[index], ...times }], []);
    setProposalStates((prev) => prev.map((s, i) => (i === index ? "accepted" : s)));
  }

  const openProposals = proposals.filter((_, i) => proposalStates[i] === "open");
  const acceptedCount = proposalStates.filter((s) => s === "accepted").length;

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

      {openProposals.length > 0 && (
        <section aria-label="Rewind suggestions" className={styles.proposal}>
          <h2 className={styles.coveredTitle}>Rewind sessions</h2>
          {proposals.map((p, i) =>
            proposalStates[i] === "open" ? (
              <ScheduleProposalCard
                key={p.start_at}
                proposal={p}
                onAccept={(times) => void acceptProposal(i, times)}
                onDismiss={() =>
                  setProposalStates((prev) => prev.map((s, j) => (j === i ? "dismissed" : s)))
                }
              />
            ) : null,
          )}
        </section>
      )}
      {acceptedCount > 0 && (
        <p className={styles.accepted} role="status">
          {acceptedCount === 1 ? "Rewind added to your calendar 🌱" : "Rewinds added to your calendar 🌱"}
        </p>
      )}

      <div className={styles.actions}>
        {onContinue ? (
          <>
            <Button variant="primary" onClick={onContinue}>
              Continue to this week
            </Button>
            <Button variant="secondary" onClick={onSeeTree}>
              See your tree
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={onSeeTree}>
            See your tree
          </Button>
        )}
        <Button variant="ghost" onClick={onExit}>
          Done
        </Button>
      </div>
    </div>
  );
}
