import { useEffect, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { ArrowLeft, CheckCircle, CircleNotch } from "@phosphor-icons/react";
import {
  Button,
  Checkbox,
  DatePicker,
  Input,
  ProgressBar,
  RadioGroup,
  TimePicker,
} from "../../components";
import { TopBar } from "../../app/shell/TopBar";
import { useSettings, type FontScale, type Theme } from "../../app/settings";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import { onModelDone, onModelError, onModelProgress } from "../../lib/ipc";
import type { AIPreset, StudyGoal, StudyWindowInput, UserProfile } from "../../lib/types";
import { GOAL_OPTIONS, PRESET_OPTIONS, recommendedPreset } from "./presets";
import { StudyWindowsEditor, validWindows } from "./StudyWindowsEditor";
import { useNavigate } from "react-router-dom";
import styles from "./SettingsScreen.module.css";

/** Per-preset download state, keyed by AIPreset, for the "Manage AI model" section. */
type ModelState =
  | { phase: "checking" }
  | { phase: "ready" }
  | { phase: "not-downloaded" }
  | { phase: "downloading"; jobId: string; progress: number; step: string }
  | { phase: "error"; message: string };

const ALL_PRESETS: AIPreset[] = ["low", "medium", "high"];

const FONT_SIZES: FontScale[] = [14, 16, 18, 20];

/** Editable text/date/time fields of the profile (goal is a radio, below). */
type ProfileFields = Omit<UserProfile, "goal">;

const EMPTY_FIELDS: ProfileFields = {
  name: "",
  year: "",
  major: "",
  term_start: "",
  term_end: "",
  wake_time: "",
  sleep_time: "",
};

/** S-09 — Settings. Display & a11y toggles apply live (client-side); the AI
 * preset and the user profile persist to their DB singletons. */
export function SettingsScreen() {
  const navigate = useNavigate();
  const settings = useSettings();
  const persisted = useAsync(() => api.getSettings(), []);
  const remoteProfile = useAsync(() => api.getProfile(), []);
  const remoteWindows = useAsync(() => api.listStudyWindows(), []);
  const sysInfo = useAsync(() => api.getSystemInfo(), []);

  const [preset, setPreset] = useState<AIPreset>("medium");
  const [fields, setFields] = useState<ProfileFields>(EMPTY_FIELDS);
  const [goal, setGoal] = useState<StudyGoal | null>(null);
  const [windows, setWindows] = useState<StudyWindowInput[]>([]);

  // Manage AI model — one download/readiness state per preset, so the user can
  // fetch a model other than the one currently in use.
  const [models, setModels] = useState<Record<AIPreset, ModelState>>({
    low: { phase: "checking" },
    medium: { phase: "checking" },
    high: { phase: "checking" },
  });

  const ramGb = sysInfo.status === "loaded" ? sysInfo.data.total_ram_gb : null;
  const recommended = ramGb === null ? null : recommendedPreset(ramGb);

  // Adopt persisted values once they load.
  useEffect(() => {
    if (persisted.status === "loaded") setPreset(persisted.data.ai_preset);
  }, [persisted.status, persisted.data]);

  useEffect(() => {
    if (remoteProfile.status === "loaded") {
      const p = remoteProfile.data;
      setFields({
        name: p.name ?? "",
        year: p.year ?? "",
        major: p.major ?? "",
        term_start: p.term_start ?? "",
        term_end: p.term_end ?? "",
        wake_time: p.wake_time ?? "",
        sleep_time: p.sleep_time ?? "",
      });
      setGoal(p.goal);
    }
  }, [remoteProfile.status, remoteProfile.data]);

  useEffect(() => {
    if (remoteWindows.status === "loaded") {
      setWindows(
        remoteWindows.data.map(({ weekday, start_time, end_time }) => ({
          weekday,
          start_time,
          end_time,
        })),
      );
    }
  }, [remoteWindows.status, remoteWindows.data]);

  function changePreset(value: AIPreset) {
    setPreset(value);
    void api.updateSettings({ ai_preset: value });
  }

  // Check readiness for every preset once, so the section can offer download
  // for models beyond the one currently selected.
  useEffect(() => {
    let cancelled = false;
    for (const p of ALL_PRESETS) {
      void api.modelReady(p).then(
        (r) => {
          if (cancelled) return;
          setModels((prev) => ({ ...prev, [p]: { phase: r.ready ? "ready" : "not-downloaded" } }));
        },
        () => {
          if (cancelled) return;
          setModels((prev) => ({ ...prev, [p]: { phase: "not-downloaded" } }));
        },
      );
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Download progress arrives as model:* events; route each by job id to the
  // preset that started it.
  useEffect(() => {
    const unsubs: UnlistenFn[] = [];
    onModelProgress((e) =>
      setModels((prev) => {
        const p = e.preset as AIPreset;
        const cur = prev[p];
        return cur.phase === "downloading" && cur.jobId === e.job_id
          ? { ...prev, [p]: { ...cur, progress: e.progress, step: e.step } }
          : prev;
      }),
    ).then((u) => unsubs.push(u));
    onModelDone((e) =>
      setModels((prev) => {
        const p = e.preset as AIPreset;
        const cur = prev[p];
        return cur.phase === "downloading" && cur.jobId === e.job_id
          ? { ...prev, [p]: { phase: "ready" } }
          : prev;
      }),
    ).then((u) => unsubs.push(u));
    onModelError((e) =>
      setModels((prev) => {
        const p = e.preset as AIPreset;
        const cur = prev[p];
        return cur.phase === "downloading" && cur.jobId === e.job_id
          ? { ...prev, [p]: { phase: "error", message: e.error } }
          : prev;
      }),
    ).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, []);

  async function downloadPreset(p: AIPreset) {
    try {
      const { job_id } = await api.downloadModel(p);
      setModels((prev) => ({
        ...prev,
        [p]: { phase: "downloading", jobId: job_id, progress: 0, step: "starting" },
      }));
    } catch (e) {
      setModels((prev) => ({ ...prev, [p]: { phase: "error", message: String(e) } }));
    }
  }

  /** Track a field locally; text fields save on blur, pickers save on change. */
  function setField(field: keyof ProfileFields, value: string, save = false) {
    setFields((prev) => ({ ...prev, [field]: value }));
    if (save) void api.updateProfile({ [field]: value });
  }

  function saveField(field: keyof ProfileFields) {
    void api.updateProfile({ [field]: (fields[field] ?? "").trim() });
  }

  function changeGoal(value: StudyGoal) {
    setGoal(value);
    void api.updateProfile({ goal: value });
  }

  function changeWindows(next: StudyWindowInput[]) {
    setWindows(next);
    if (validWindows(next)) void api.setStudyWindows(next);
  }

  return (
    <div className={styles.screen}>
      <TopBar />
      <main className={styles.main}>
        <div className="page">
          <button type="button" className={styles.back} onClick={() => navigate(-1)}>
            <ArrowLeft /> Back
          </button>
          <h1 className={styles.h1}>Settings</h1>

          {/* ── Profile ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Profile</h2>
            <p className={styles.hint}>
              The answers from onboarding. Everything stays on your device.
            </p>
            <div className={styles.profileGrid}>
              <Input
                label="Name"
                value={fields.name ?? ""}
                onChange={(e) => setField("name", e.target.value)}
                onBlur={() => saveField("name")}
              />
              <Input
                label="Year of study"
                value={fields.year ?? ""}
                onChange={(e) => setField("year", e.target.value)}
                onBlur={() => saveField("year")}
              />
              <Input
                label="Field of study"
                value={fields.major ?? ""}
                onChange={(e) => setField("major", e.target.value)}
                onBlur={() => saveField("major")}
              />
            </div>
            <div className={styles.profileGrid}>
              <DatePicker
                label="Term starts"
                value={fields.term_start ?? ""}
                onChange={(v) => setField("term_start", v, true)}
              />
              <DatePicker
                label="Term ends"
                value={fields.term_end ?? ""}
                onChange={(v) => setField("term_end", v, true)}
                min={fields.term_start || undefined}
              />
            </div>
            <div className={styles.profileGrid}>
              <TimePicker
                label="I usually wake up around"
                value={fields.wake_time ?? ""}
                onChange={(v) => setField("wake_time", v, true)}
              />
              <TimePicker
                label="I usually sleep around"
                value={fields.sleep_time ?? ""}
                onChange={(v) => setField("sleep_time", v, true)}
              />
            </div>

            <h3 className={styles.subTitle}>Study goal</h3>
            <RadioGroup
              legend="Study goal"
              hideLegend
              options={GOAL_OPTIONS}
              value={goal ?? ("" as StudyGoal)}
              onChange={changeGoal}
            />

            <h3 className={styles.subTitle}>Weekly study windows</h3>
            <p className={styles.hint}>
              When you are usually free to study. Suggested sessions only land inside these.
            </p>
            <StudyWindowsEditor windows={windows} onChange={changeWindows} />
          </section>

          {/* ── AI preset ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>AI model preset</h2>
            <RadioGroup
              legend="Machine preset"
              hideLegend
              options={PRESET_OPTIONS.map((o) =>
                o.value === recommended ? { ...o, badge: "Recommended" } : o,
              )}
              value={preset}
              onChange={changePreset}
            />
            {ramGb !== null && recommended !== null && (
              <p className={styles.hint}>
                Your machine has ~{Math.round(ramGb)} GB RAM →{" "}
                {PRESET_OPTIONS.find((o) => o.value === recommended)?.label} suits it best.
              </p>
            )}
          </section>

          {/* ── Manage AI model ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Manage AI model</h2>
            <p className={styles.hint}>
              Download any preset's model ahead of time, or check what's already on this machine.
              Everything downloads and runs locally — nothing is sent anywhere.
            </p>
            <div className={styles.modelList}>
              {PRESET_OPTIONS.map((o) => {
                const state = models[o.value];
                return (
                  <div key={o.value} className={styles.modelRow}>
                    <div className={styles.modelInfo}>
                      <span className={styles.rowLabel}>
                        {o.icon} {o.label}
                      </span>
                      <span className={styles.hint}>{o.description}</span>
                      {state.phase === "downloading" && (
                        <ProgressBar
                          value={state.progress}
                          label={state.step || "Downloading model…"}
                        />
                      )}
                      {state.phase === "error" && (
                        <p className={styles.dlError} role="alert">
                          Download failed: {state.message}
                        </p>
                      )}
                    </div>
                    <div className={styles.modelAction}>
                      {state.phase === "checking" && (
                        <CircleNotch className={styles.spin} aria-label="Checking…" />
                      )}
                      {state.phase === "ready" && (
                        <span className={styles.ready}>
                          <CheckCircle weight="fill" aria-hidden="true" /> Downloaded
                        </span>
                      )}
                      {(state.phase === "not-downloaded" || state.phase === "error") && (
                        <Button variant="secondary" size="sm" onClick={() => downloadPreset(o.value)}>
                          Download
                        </Button>
                      )}
                      {state.phase === "downloading" && (
                        <Button variant="ghost" size="sm" disabled>
                          Downloading…
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Display & accessibility ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Display & accessibility</h2>

            <div className={styles.row}>
              <span className={styles.rowLabel}>Text size</span>
              <div className={styles.segmented} role="group" aria-label="Text size">
                {FONT_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={`${styles.segment} ${settings.fontScale === size ? styles.segmentActive : ""}`}
                    aria-pressed={settings.fontScale === size}
                    onClick={() => settings.set("fontScale", size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.row}>
              <span className={styles.rowLabel}>Theme</span>
              <div className={styles.segmented} role="group" aria-label="Theme">
                {(["light", "dark"] as Theme[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`${styles.segment} ${settings.theme === t ? styles.segmentActive : ""}`}
                    aria-pressed={settings.theme === t}
                    onClick={() => settings.set("theme", t)}
                  >
                    {t === "light" ? "Light" : "Dark"}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.toggles}>
              <Checkbox
                label="High contrast"
                checked={settings.contrast === "high"}
                onChange={(e) => settings.set("contrast", e.target.checked ? "high" : "normal")}
              />
              <Checkbox
                label="Reduce motion"
                checked={settings.reducedMotion}
                onChange={(e) => settings.set("reducedMotion", e.target.checked)}
              />
              <Checkbox
                label="Focus mode (hide the sidebar to reduce distractions)"
                checked={settings.focusMode}
                onChange={(e) => settings.set("focusMode", e.target.checked)}
              />
            </div>
          </section>

          {/* ── Pet ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Pet</h2>
            <div className={styles.toggles}>
              <Checkbox
                label="Let the pet offer suggestions (one small bubble at most, easy to dismiss)"
                checked={settings.petSuggestions}
                onChange={(e) => settings.set("petSuggestions", e.target.checked)}
              />
            </div>
            <p className={styles.hint}>
              With this off, the pet only ever speaks when you ask it something.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
