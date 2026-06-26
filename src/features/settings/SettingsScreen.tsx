import { useEffect, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { Checkbox, RadioGroup } from "../../components";
import { TopBar } from "../../app/shell/TopBar";
import { useSettings, type FontScale, type Theme } from "../../app/settings";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import type { AIPreset } from "../../lib/types";
import { PRESET_OPTIONS, recommendedPreset } from "./presets";
import { useNavigate } from "react-router-dom";
import styles from "./SettingsScreen.module.css";

const FONT_SIZES: FontScale[] = [14, 16, 18, 20];
const MOCK_RAM_GB = 16;

/** S-09 — Settings. Display & a11y toggles apply live (client-side); the AI
 * preset persists to the DB settings singleton. */
export function SettingsScreen() {
  const navigate = useNavigate();
  const settings = useSettings();
  const persisted = useAsync(() => api.getSettings(), []);
  const [preset, setPreset] = useState<AIPreset>("medium");
  const recommended = recommendedPreset(MOCK_RAM_GB);

  // Adopt the persisted preset once it loads.
  useEffect(() => {
    if (persisted.status === "loaded") setPreset(persisted.data.ai_preset);
  }, [persisted.status, persisted.data]);

  function changePreset(value: AIPreset) {
    setPreset(value);
    void api.updateSettings({ ai_preset: value });
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

          {/* ── AI preset ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>AI — machine preset</h2>
            <RadioGroup
              legend="Machine preset"
              hideLegend
              options={PRESET_OPTIONS.map((o) => (o.value === recommended ? { ...o, badge: "Recommended" } : o))}
              value={preset}
              onChange={changePreset}
            />
            <p className={styles.hint}>Your machine has ~{MOCK_RAM_GB} GB RAM → {PRESET_OPTIONS.find((o) => o.value === recommended)?.label} suits it best.</p>
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
        </div>
      </main>
    </div>
  );
}
