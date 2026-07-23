import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarBlank, X } from "@phosphor-icons/react";
import { useSettings } from "../settings";
import { api } from "../../lib/api";
import { Button, IconButton } from "../../components";
import type { DeadlineAlert } from "../../lib/types";
import styles from "./DeadlineBanner.module.css";

/** How near a deadline must be to surface. A calm week — far enough to act,
 * close enough to matter (ADR-0013). */
const HORIZON_DAYS = 7;

const KIND_LABEL: Record<DeadlineAlert["type"], string> = {
  exam: "exam",
  assignment: "assignment",
  other: "deadline",
};

/** Neutral fact, never a countdown-as-pressure (ADR-0007). */
function whenPhrase(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/**
 * App-wide calm deadline alert (ADR-0013). Appears only when a deadline is
 * genuinely near, states it as a plain fact (earth gold, never red, no
 * countdown), offers a jump to that subject's plan, and can be dismissed for the
 * session. Hidden in focus mode; invisible on the happy path — like the sidecar
 * banner, the app only speaks up when there's something worth a glance.
 */
export function DeadlineBanner() {
  const navigate = useNavigate();
  const { focusMode } = useSettings();
  const [alerts, setAlerts] = useState<DeadlineAlert[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api
      .upcomingDeadlines(HORIZON_DAYS)
      .then(setAlerts)
      .catch(() => {});
  }, []);

  if (focusMode || dismissed || alerts.length === 0) return null;

  const [next, ...rest] = alerts;

  return (
    <div className={styles.banner} role="status">
      <CalendarBlank weight="fill" className={styles.icon} aria-hidden="true" />
      <span className={styles.text}>
        <strong className={styles.subject}>{next.subject_name}</strong> {KIND_LABEL[next.type]}:{" "}
        {next.title} · {whenPhrase(next.days_until)}
        {rest.length > 0 && <span className={styles.more}> · +{rest.length} more coming up</span>}
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => navigate(`/subject/${next.subject_id}/plan`)}
      >
        Plan
      </Button>
      <IconButton
        label="Dismiss deadline reminder"
        icon={<X />}
        size="sm"
        onClick={() => setDismissed(true)}
      />
    </div>
  );
}
