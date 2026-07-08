import { useEffect, useState } from "react";
import { CircleNotch, Warning } from "@phosphor-icons/react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { appLogDir } from "@tauri-apps/api/path";
import { api } from "../../lib/api";
import { Button } from "../../components/Button";
import type { SidecarEvent } from "../../lib/ipc";
import styles from "./SidecarBanner.module.css";

type State = SidecarEvent["state"] | "unknown";

/** Fast startups shouldn't flash a banner; only surface "starting" if the
 * sidecar is still coming up after this long. */
const STARTING_GRACE_MS = 1500;

/**
 * App-wide status strip for the Python AI sidecar. Invisible on the happy path;
 * appears only while the engine is still coming up (after a short grace, so a
 * normal launch shows nothing) or when it failed to start — in which case it
 * offers a real retry instead of leaving AI features silently dead. Calm by
 * design: gold, never red (law of the house style), and it never blocks the UI.
 */
export function SidecarBanner() {
  const [state, setState] = useState<State>("unknown");
  const [showStarting, setShowStarting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [logDir, setLogDir] = useState<string | null>(null);

  // Seed from the current status, then follow lifecycle events.
  useEffect(() => {
    let unsub: UnlistenFn | undefined;
    api
      .sidecarStatus()
      .then((s) => setState((prev) => (prev === "unknown" ? (s.ready ? "ready" : "starting") : prev)))
      .catch(() => {});
    api
      .onSidecarStatus((e) => {
        setState(e.state);
        if (e.state !== "crashed") setRetrying(false);
      })
      .then((u) => {
        unsub = u;
      });
    return () => unsub?.();
  }, []);

  // Delay the "starting" banner so a quick, healthy launch stays silent.
  useEffect(() => {
    if (state !== "starting") {
      setShowStarting(false);
      return;
    }
    const t = window.setTimeout(() => setShowStarting(true), STARTING_GRACE_MS);
    return () => window.clearTimeout(t);
  }, [state]);

  // Resolve the log location once we need to point the user at it.
  useEffect(() => {
    if (state === "crashed" && logDir === null) {
      appLogDir()
        .then(setLogDir)
        .catch(() => {});
    }
  }, [state, logDir]);

  async function retry() {
    setRetrying(true);
    try {
      await api.restartSidecar();
    } catch {
      setRetrying(false);
    }
  }

  const crashed = state === "crashed";
  const starting = state === "starting" && showStarting;
  if (!crashed && !starting) return null;

  if (starting) {
    return (
      <div className={`${styles.banner} ${styles.calm}`} role="status">
        <CircleNotch weight="bold" className={styles.spin} aria-hidden="true" />
        <span className={styles.text}>
          Starting the study assistant… <span className={styles.muted}>first launch can take a moment</span>
        </span>
      </div>
    );
  }

  return (
    <div className={`${styles.banner} ${styles.warn}`} role="alert">
      <Warning weight="fill" className={styles.icon} aria-hidden="true" />
      <span className={styles.text}>
        {retrying ? "Restarting the study assistant…" : "The study assistant didn't start."}
        <span className={styles.muted}>
          {retrying
            ? " Give it a moment."
            : ` AI features are paused.${logDir ? ` See sidecar.log in ${logDir}` : ""}`}
        </span>
      </span>
      <Button variant="secondary" size="sm" onClick={retry} disabled={retrying}>
        Try again
      </Button>
    </div>
  );
}
