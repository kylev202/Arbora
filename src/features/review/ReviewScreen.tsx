import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CaretLeft,
  CaretRight,
  Check,
  CheckCircle,
  PencilSimple,
  X,
} from "@phosphor-icons/react";
import { Button, Disclaimer, EmptyState, Kbd } from "../../components";
import { useAsync } from "../../lib/useAsync";
import { mockApi } from "../../mocks/api";
import type { ReviewItem } from "../../lib/types";
import { ReviewCard } from "./ReviewCard";
import styles from "./ReviewScreen.module.css";

type Status = "pending" | "kept" | "discarded";

/**
 * S-05 — Review queue: the MANDATORY gate (Law #2). No AI item is trusted until
 * the human keeps it here. Keyboard-complete: ←/→ navigate, A keep, D discard,
 * E edit, Esc back. No red anywhere — discard is neutral, not punishing.
 */
export function ReviewScreen() {
  const { subjectId = "" } = useParams();
  const navigate = useNavigate();
  const queue = useAsync(() => mockApi.getReviewQueue(subjectId), [subjectId]);

  const [items, setItems] = useState<ReviewItem[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);

  // Seed local state once loaded.
  useEffect(() => {
    if (queue.status === "loaded") {
      setItems(queue.data);
      setStatuses(Object.fromEntries(queue.data.map((i) => [i.id, "pending" as Status])));
      setIndex(0);
    }
  }, [queue.status, queue.data]);

  const total = items.length;
  const decided = useMemo(
    () => Object.values(statuses).filter((s) => s !== "pending").length,
    [statuses],
  );
  const current = items[index];
  const allDone = total > 0 && decided === total;

  const go = useCallback(
    (delta: number) => {
      setEditing(false);
      setIndex((i) => Math.min(total - 1, Math.max(0, i + delta)));
    },
    [total],
  );

  const decide = useCallback(
    (status: Status) => {
      if (!current) return;
      setStatuses((prev) => ({ ...prev, [current.id]: status }));
      setEditing(false);
      // Advance to the next still-pending item, else stay.
      setIndex((i) => {
        for (let k = i + 1; k < total; k++) {
          if (statuses[items[k]?.id] === "pending") return k;
        }
        return i;
      });
    },
    [current, items, statuses, total],
  );

  const approveAll = () => {
    setStatuses((prev) => {
      const next = { ...prev };
      for (const it of items) if (next[it.id] === "pending") next[it.id] = "kept";
      return next;
    });
  };

  const saveEdit = (updated: ReviewItem) => {
    setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
    setEditing(false);
  };

  // Global keyboard map (ignored while typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
      if (e.key === "Escape") {
        if (editing) setEditing(false);
        else navigate(`/subject/${subjectId}/content`);
        return;
      }
      if (typing) return;
      switch (e.key.toLowerCase()) {
        case "arrowleft":
          go(-1);
          break;
        case "arrowright":
          go(1);
          break;
        case "a":
          decide("kept");
          break;
        case "d":
          decide("discarded");
          break;
        case "e":
          setEditing((v) => !v);
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, go, decide, navigate, subjectId]);

  // ── render ───────────────────────────────────────────────────────────────
  if (queue.status === "loading") {
    return <div className="page">{<div className={styles.skeleton} aria-hidden="true" />}</div>;
  }

  if (total === 0) {
    return (
      <div className="page">
        <EmptyState
          icon={<CheckCircle weight="fill" />}
          title="Nothing to review"
          description="Generate content from your sources and it'll appear here for review before saving."
          action={
            <Button variant="secondary" onClick={() => navigate(`/subject/${subjectId}/sources`)}>
              Go to sources
            </Button>
          }
        />
      </div>
    );
  }

  const currentStatus = current ? statuses[current.id] : "pending";

  return (
    <div className={styles.screen}>
      <Disclaimer variant="banner" />

      <div className={styles.body}>
        <div className="page">
          <div className={styles.toolbar}>
            <div className={styles.progress}>
              <span className={styles.count}>
                {decided} / {total} reviewed
              </span>
              <div
                className={styles.bar}
                role="progressbar"
                aria-valuenow={decided}
                aria-valuemin={0}
                aria-valuemax={total}
                aria-label="Review progress"
              >
                <div className={styles.barFill} style={{ width: `${(decided / total) * 100}%` }} />
              </div>
            </div>
            {!allDone && (
              <Button variant="ghost" onClick={approveAll}>
                Keep all remaining
              </Button>
            )}
          </div>

          {allDone ? (
            <EmptyState
              icon={<CheckCircle weight="fill" />}
              title="Review complete"
              description="Kept items are saved to this subject. Discarded ones are gone — nothing untraceable was trusted."
              action={
                <Button variant="primary" onClick={() => navigate(`/subject/${subjectId}/content`)}>
                  Back to content
                </Button>
              }
            />
          ) : (
            current && (
              <>
                {currentStatus !== "pending" && (
                  <p className={styles.decided}>
                    {currentStatus === "kept" ? "Kept ✓" : "Discarded"} — you can still change this.
                  </p>
                )}

                <ReviewCard
                  item={current}
                  editing={editing}
                  onSaveEdit={saveEdit}
                  onCancelEdit={() => setEditing(false)}
                />

                {!editing && (
                  <div className={styles.actions}>
                    <Button
                      variant="ghost"
                      icon={<CaretLeft />}
                      onClick={() => go(-1)}
                      disabled={index === 0}
                      aria-label="Previous item"
                    />
                    <div className={styles.decideGroup}>
                      <Button variant="ghost" icon={<PencilSimple />} onClick={() => setEditing(true)}>
                        Edit
                      </Button>
                      <Button variant="secondary" icon={<X />} onClick={() => decide("discarded")}>
                        Discard
                      </Button>
                      <Button variant="primary" icon={<Check weight="bold" />} onClick={() => decide("kept")}>
                        Keep
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      icon={<CaretRight />}
                      onClick={() => go(1)}
                      disabled={index === total - 1}
                      aria-label="Next item"
                    />
                  </div>
                )}

                <p className={styles.hints}>
                  <Kbd>←</Kbd> <Kbd>→</Kbd> navigate · <Kbd>A</Kbd> keep · <Kbd>D</Kbd> discard ·{" "}
                  <Kbd>E</Kbd> edit · <Kbd>Esc</Kbd> back
                </p>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
