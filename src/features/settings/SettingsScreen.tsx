import { useEffect, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { Checkbox, Input, RadioGroup } from "../../components";
import { TopBar } from "../../app/shell/TopBar";
import { useSettings, type FontScale, type Theme } from "../../app/settings";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import type { AIPreset, StudyGoal, StudyWindowInput, UserProfile } from "../../lib/types";
import { GOAL_OPTIONS, PRESET_OPTIONS, recommendedPreset } from "./presets";
import { StudyWindowsEditor, validWindows } from "./StudyWindowsEditor";
import { useNavigate } from "react-router-dom";
import styles from "./SettingsScreen.module.css";

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
              <Input
                label="Term starts"
                type="date"
                value={fields.term_start ?? ""}
                onChange={(e) => setField("term_start", e.target.value, true)}
              />
              <Input
                label="Term ends"
                type="date"
                value={fields.term_end ?? ""}
                onChange={(e) => setField("term_end", e.target.value, true)}
              />
            </div>
            <div className={styles.profileGrid}>
              <Input
                label="I usually wake up around"
                type="time"
                value={fields.wake_time ?? ""}
                onChange={(e) => setField("wake_time", e.target.value, true)}
              />
              <Input
                label="I usually sleep around"
                type="time"
                value={fields.sleep_time ?? ""}
                onChange={(e) => setField("sleep_time", e.target.value, true)}
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
