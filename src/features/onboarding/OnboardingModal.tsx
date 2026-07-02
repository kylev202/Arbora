import { useEffect, useRef, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { Plus, Tree, X } from "@phosphor-icons/react";
import {
  Button,
  Disclaimer,
  IconButton,
  Input,
  LeafMotif,
  Modal,
  ProgressBar,
  RadioGroup,
} from "../../components";
import { onModelDone, onModelError, onModelProgress } from "../../lib/ipc";
import { api } from "../../lib/api";
import type { AIPreset, StudyGoal, StudyWindowInput } from "../../lib/types";
import { GOAL_OPTIONS, PRESET_OPTIONS, recommendedPreset } from "../settings/presets";
import { StudyWindowsEditor, validWindows } from "../settings/StudyWindowsEditor";
import styles from "./OnboardingModal.module.css";

const TOTAL_STEPS = 7;

// Mirrors HomeScreen's palette so onboarding-created subjects match.
const SUBJECT_COLORS = ["#4A7C59", "#5A7D9A", "#C9A227", "#8A6BA3", "#B5524A", "#3F7E7C"];

type DownloadPhase =
  | { phase: "checking" }
  | { phase: "idle"; ollamaRunning: boolean }
  | { phase: "ready" } // model already in the local store
  | { phase: "downloading"; jobId: string; progress: number; step: string }
  | { phase: "done" }
  | { phase: "later" }
  | { phase: "error"; message: string };

/**
 * S-10 — first-run onboarding, expanded into a 7-step interview (redesign
 * slice A). Every step can be skipped and every answer edited later in
 * Settings; the whole flow stays calm and non-coercive. Answers persist to the
 * local `user_profile` / `study_windows` tables only (law #3).
 */
export function OnboardingModal({ open, onFinish }: { open: boolean; onFinish: () => void }) {
  const [step, setStep] = useState(1);

  // Step 2 — identity
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [major, setMajor] = useState("");

  // Step 3 — subjects this term + term dates
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [termStart, setTermStart] = useState("");
  const [termEnd, setTermEnd] = useState("");

  // Step 4 — daily rhythm
  const [wakeTime, setWakeTime] = useState("");
  const [sleepTime, setSleepTime] = useState("");

  // Step 5 — weekly study windows
  const [windows, setWindows] = useState<StudyWindowInput[]>([]);

  // Step 6 — goal
  const [goal, setGoal] = useState<StudyGoal | null>(null);

  // Step 7 — device-based preset recommendation + model download
  const [ramGb, setRamGb] = useState<number | null>(null);
  const [preset, setPreset] = useState<AIPreset>("medium");
  const presetTouched = useRef(false);
  const [download, setDownload] = useState<DownloadPhase>({ phase: "checking" });

  const recommended = ramGb === null ? null : recommendedPreset(ramGb);

  // Real device RAM (instant: pure Rust, no sidecar). Unknown RAM just means
  // no recommendation copy; the user picks freely.
  useEffect(() => {
    if (!open) return;
    api
      .getSystemInfo()
      .then((info) => {
        setRamGb(info.total_ram_gb);
        if (!presetTouched.current) setPreset(recommendedPreset(info.total_ram_gb));
      })
      .catch(() => setRamGb(null));
  }, [open]);

  // On the model step, check whether the chosen preset's model is already there.
  useEffect(() => {
    if (!open || step !== TOTAL_STEPS) return;
    let cancelled = false;
    setDownload({ phase: "checking" });
    api
      .modelReady(preset)
      .then((r) => {
        if (cancelled) return;
        setDownload(r.ready ? { phase: "ready" } : { phase: "idle", ollamaRunning: r.ollama_running });
      })
      .catch(() => {
        // Sidecar still starting: allow "Later" instead of blocking the finish.
        if (!cancelled) setDownload({ phase: "idle", ollamaRunning: false });
      });
    return () => {
      cancelled = true;
    };
  }, [open, step, preset]);

  // Download progress arrives as model:* events; filter by our job id.
  useEffect(() => {
    if (!open) return;
    const unsubs: UnlistenFn[] = [];
    onModelProgress((e) =>
      setDownload((d) =>
        d.phase === "downloading" && d.jobId === e.job_id
          ? { ...d, progress: e.progress, step: e.step }
          : d,
      ),
    ).then((u) => unsubs.push(u));
    onModelDone((e) =>
      setDownload((d) => (d.phase === "downloading" && d.jobId === e.job_id ? { phase: "done" } : d)),
    ).then((u) => unsubs.push(u));
    onModelError((e) =>
      setDownload((d) =>
        d.phase === "downloading" && d.jobId === e.job_id
          ? { phase: "error", message: e.error }
          : d,
      ),
    ).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, [open]);

  async function startDownload() {
    try {
      const { job_id } = await api.downloadModel(preset);
      setDownload({ phase: "downloading", jobId: job_id, progress: 0, step: "starting" });
    } catch (e) {
      setDownload({ phase: "error", message: String(e) });
    }
  }

  function changePreset(value: AIPreset) {
    if (download.phase === "downloading") return; // let the current pull finish
    presetTouched.current = true;
    setPreset(value);
  }

  /** Persist the current step's answers (Next). Skip leaves them out entirely. */
  function persistStep(current: number) {
    const orNull = (v: string) => (v.trim() === "" ? undefined : v.trim());
    switch (current) {
      case 2:
        void api.updateProfile({ name: orNull(name), year: orNull(year), major: orNull(major) });
        break;
      case 3:
        void api.updateProfile({ term_start: orNull(termStart), term_end: orNull(termEnd) });
        break;
      case 4:
        void api.updateProfile({ wake_time: orNull(wakeTime), sleep_time: orNull(sleepTime) });
        break;
      case 5:
        if (windows.length > 0 && validWindows(windows)) void api.setStudyWindows(windows);
        break;
      case 6:
        if (goal) void api.updateProfile({ goal });
        break;
    }
  }

  function next() {
    persistStep(step);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }

  function skipStep() {
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }

  /** Finish (last step or closing early). Creates the listed subjects once and
   * records the chosen preset; safe to call with everything skipped. */
  function finish() {
    for (const [i, subjectName] of subjects.entries()) {
      void api.createSubject(subjectName, SUBJECT_COLORS[i % SUBJECT_COLORS.length]);
    }
    void api.updateSettings({ ai_preset: preset, onboarded: true });
    onFinish();
  }

  function addSubject() {
    const value = subjectDraft.trim();
    if (value === "" || subjects.includes(value)) return;
    setSubjects((prev) => [...prev, value]);
    setSubjectDraft("");
  }

  const isLast = step === TOTAL_STEPS;

  return (
    <Modal
      open={open}
      onClose={finish}
      title="Welcome to Arbora"
      meta={
        <span className={styles.stepMeta}>
          <span className={styles.stepLeaves} aria-hidden="true">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <LeafMotif
                key={i}
                size={13}
                className={i < step ? styles.stepLeafGrown : styles.stepLeaf}
              />
            ))}
          </span>
          {step} / {TOTAL_STEPS}
        </span>
      }
      footer={
        <div className={styles.footer}>
          {step > 1 && !isLast ? (
            <Button variant="ghost" onClick={skipStep}>
              Skip this step
            </Button>
          ) : (
            <span />
          )}
          <div className={styles.footerRight}>
            {step > 1 && (
              <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            {isLast ? (
              <Button variant="primary" onClick={finish}>
                Get started
              </Button>
            ) : (
              <Button variant="primary" onClick={next}>
                {step === 1 ? "Begin" : "Next"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      {step === 1 && (
        <div className={styles.welcome}>
          <Tree weight="fill" className={styles.welcomeIcon} aria-hidden="true" />
          <p className={styles.lead}>
            Turn your own documents and lectures into <strong>grounded, cited</strong> notes,
            flashcards, and quizzes, then review them with calm spaced repetition.
          </p>
          <p className={styles.lead}>
            A few quick questions help Arbora plan around your week. Every step is optional, and
            you can change any answer later in Settings.
          </p>
          <Disclaimer>Everything stays on your device. Nothing is sent anywhere.</Disclaimer>
        </div>
      )}

      {step === 2 && (
        <div className={styles.step}>
          <p className={styles.lead}>A little about you, so Arbora can greet you properly.</p>
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <div className={styles.pair}>
            <Input
              label="Year of study"
              placeholder="e.g. Year 2"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
            <Input
              label="Field of study"
              placeholder="e.g. Computer Science"
              value={major}
              onChange={(e) => setMajor(e.target.value)}
            />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className={styles.step}>
          <p className={styles.lead}>
            Which subjects are you taking this term? You can add or change subjects any time.
          </p>
          <form
            className={styles.addRow}
            onSubmit={(e) => {
              e.preventDefault();
              addSubject();
            }}
          >
            <Input
              label="Subject name"
              placeholder="e.g. Molecular Biology"
              value={subjectDraft}
              onChange={(e) => setSubjectDraft(e.target.value)}
            />
            <Button type="submit" variant="secondary" icon={<Plus />}>
              Add
            </Button>
          </form>
          {subjects.length > 0 && (
            <ul className={styles.chipList}>
              {subjects.map((s) => (
                <li key={s} className={styles.chip}>
                  {s}
                  <IconButton
                    label={`Remove ${s}`}
                    icon={<X />}
                    size="sm"
                    onClick={() => setSubjects((prev) => prev.filter((x) => x !== s))}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className={styles.pair}>
            <Input
              label="Term starts"
              type="date"
              value={termStart}
              onChange={(e) => setTermStart(e.target.value)}
            />
            <Input
              label="Term ends"
              type="date"
              value={termEnd}
              onChange={(e) => setTermEnd(e.target.value)}
            />
          </div>
        </div>
      )}

      {step === 4 && (
        <div className={styles.step}>
          <p className={styles.lead}>
            Your usual rhythm, so suggested study sessions land at humane hours.
          </p>
          <div className={styles.pair}>
            <Input
              label="I usually wake up around"
              type="time"
              value={wakeTime}
              onChange={(e) => setWakeTime(e.target.value)}
            />
            <Input
              label="I usually sleep around"
              type="time"
              value={sleepTime}
              onChange={(e) => setSleepTime(e.target.value)}
            />
          </div>
        </div>
      )}

      {step === 5 && (
        <div className={styles.step}>
          <p className={styles.lead}>
            When are you usually free to study? These windows are where Arbora will suggest
            sessions, never outside them.
          </p>
          <StudyWindowsEditor windows={windows} onChange={setWindows} />
        </div>
      )}

      {step === 6 && (
        <div className={styles.step}>
          <p className={styles.lead}>What are you aiming for this term?</p>
          <RadioGroup
            legend="Study goal"
            hideLegend
            options={GOAL_OPTIONS}
            value={goal ?? ("" as StudyGoal)}
            onChange={setGoal}
          />
        </div>
      )}

      {step === 7 && (
        <div className={styles.step}>
          <p className={styles.lead}>
            {ramGb !== null && recommended ? (
              <>
                Your machine has ~{Math.round(ramGb)} GB RAM. We recommend the{" "}
                <strong>{PRESET_OPTIONS.find((o) => o.value === recommended)?.label}</strong> preset,
                and you can change it any time.
              </>
            ) : (
              <>Pick the AI configuration that suits your machine. You can change it any time.</>
            )}
          </p>
          <RadioGroup
            legend="AI configuration"
            hideLegend
            options={PRESET_OPTIONS.map((o) =>
              o.value === recommended ? { ...o, badge: "Recommended" } : o,
            )}
            value={preset}
            onChange={changePreset}
          />

          {download.phase === "checking" && <p className={styles.dlNote}>Checking your model…</p>}
          {download.phase === "ready" && (
            <p className={styles.ready}>This model is already on your machine 🌱</p>
          )}
          {download.phase === "done" && (
            <p className={styles.ready}>Model downloaded. Ready to grow your first tree 🌱</p>
          )}
          {download.phase === "later" && (
            <p className={styles.dlNote}>No problem, Arbora will offer the download when needed.</p>
          )}
          {download.phase === "idle" && (
            <>
              {!download.ollamaRunning && (
                <p className={styles.dlNote}>
                  The local AI engine (Ollama) is not reachable yet. You can still finish and
                  download the model later from Settings.
                </p>
              )}
              <div className={styles.downloadActions}>
                <Button variant="primary" onClick={startDownload} disabled={!download.ollamaRunning}>
                  Download now
                </Button>
                <Button variant="ghost" onClick={() => setDownload({ phase: "later" })}>
                  Later
                </Button>
              </div>
            </>
          )}
          {download.phase === "downloading" && (
            <>
              <ProgressBar
                value={download.progress}
                label={download.step || "Downloading model…"}
              />
              <p className={styles.dlNote}>
                You can finish now, the download keeps going in the background.
              </p>
            </>
          )}
          {download.phase === "error" && (
            <>
              <p className={styles.dlError} role="alert">
                The download did not finish: {download.message}
              </p>
              <p className={styles.dlNote}>
                You can try again, pick a smaller preset above, or finish and download later.
              </p>
              <div className={styles.downloadActions}>
                <Button variant="secondary" onClick={startDownload}>
                  Try again
                </Button>
                <Button variant="ghost" onClick={() => setDownload({ phase: "later" })}>
                  Later
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
