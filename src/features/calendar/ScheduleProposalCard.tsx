import { useState } from "react";
import { Button, DatePicker, TimePicker } from "../../components";
import styles from "./ScheduleProposalCard.module.css";

export type ProposalView = {
  title: string;
  start_at: string;
  end_at: string;
  reason: string;
  /** Visual hint: a new session vs a neutral move of a missed one. */
  isMove?: boolean;
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function label(iso: string): string {
  const [date, time] = iso.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return `${DAY_NAMES[(day + 6) % 7]} ${d} · ${time}`;
}

/**
 * One AI proposal awaiting review (law #2): clearly a suggestion, not a saved
 * event. [Accept] [Edit] [Dismiss]; Edit adjusts date/times inline before
 * accepting. Used by the calendar proposals panel and the pet chat.
 */
export function ScheduleProposalCard({
  proposal,
  onAccept,
  onDismiss,
}: {
  proposal: ProposalView;
  onAccept: (edited: { start_at: string; end_at: string }) => void;
  onDismiss: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(proposal.start_at.split("T")[0]);
  const [start, setStart] = useState(proposal.start_at.split("T")[1]);
  const [end, setEnd] = useState(proposal.end_at.split("T")[1]);

  function accept() {
    onAccept({ start_at: `${date}T${start}`, end_at: `${date}T${end}` });
  }

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <span className={styles.badge}>{proposal.isMove ? "Suggested move" : "Suggestion"}</span>
        <span className={styles.title}>{proposal.title}</span>
      </div>
      {editing ? (
        <div className={styles.editRow}>
          <DatePicker label="Date" value={date} onChange={setDate} />
          <div className={styles.editTimes}>
            <TimePicker label="From" value={start} onChange={setStart} />
            <TimePicker label="Until" value={end} onChange={setEnd} />
          </div>
        </div>
      ) : (
        <p className={styles.when}>
          {label(proposal.start_at)} – {proposal.end_at.split("T")[1]}
        </p>
      )}
      <p className={styles.reason}>{proposal.reason}</p>
      <div className={styles.actions}>
        <Button size="sm" variant="primary" onClick={accept}>
          Accept
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setEditing((e) => !e)}>
          {editing ? "Keep original time" : "Edit"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
