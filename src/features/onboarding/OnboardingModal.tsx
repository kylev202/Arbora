import { useState } from "react";
import { Tree } from "@phosphor-icons/react";
import { Button, Disclaimer, Modal, ProgressBar, RadioGroup } from "../../components";
import type { AIPreset } from "../../lib/types";
import { PRESET_OPTIONS, recommendedPreset } from "../settings/presets";
import styles from "./OnboardingModal.module.css";

const MOCK_RAM_GB = 16;

/**
 * S-10 — first-run onboarding. Three calm steps; never coercive — "Later"/"Skip"
 * is always available. Preset is recommended from device RAM but freely changed.
 */
export function OnboardingModal({ open, onFinish }: { open: boolean; onFinish: () => void }) {
  const [step, setStep] = useState(1);
  const recommended = recommendedPreset(MOCK_RAM_GB);
  const [preset, setPreset] = useState<AIPreset>(recommended);
  const [download, setDownload] = useState<number | null>(null);

  function startDownload() {
    setDownload(0);
    const timer = window.setInterval(() => {
      setDownload((p) => {
        const next = Math.min(1, (p ?? 0) + 0.08);
        if (next >= 1) window.clearInterval(timer);
        return next;
      });
    }, 200);
  }

  return (
    <Modal
      open={open}
      onClose={onFinish}
      title="Welcome to Arbora"
      meta={`${step} / 3`}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onFinish}>
            {step < 3 ? "Skip" : "Later"}
          </Button>
          <div className={styles.footerRight}>
            {step > 1 && (
              <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            {step < 3 ? (
              <Button variant="primary" onClick={() => setStep((s) => s + 1)}>
                Next
              </Button>
            ) : (
              <Button variant="primary" onClick={onFinish}>
                Get started
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
            flashcards, and quizzes — then review them with calm spaced repetition.
          </p>
          <Disclaimer>Everything stays on your device unless you opt in to an online key.</Disclaimer>
        </div>
      )}

      {step === 2 && (
        <div className={styles.step}>
          <p className={styles.lead}>
            Your machine has ~{MOCK_RAM_GB} GB RAM. We recommend the{" "}
            <strong>{PRESET_OPTIONS.find((o) => o.value === recommended)?.label}</strong> preset —
            you can change it any time.
          </p>
          <RadioGroup
            legend="AI configuration"
            hideLegend
            options={PRESET_OPTIONS.map((o) => (o.value === recommended ? { ...o, badge: "Recommended" } : o))}
            value={preset}
            onChange={setPreset}
          />
        </div>
      )}

      {step === 3 && (
        <div className={styles.step}>
          <p className={styles.lead}>The AI model downloads once on first use (~2 GB). You can do this now in the background, or later.</p>
          {download === null ? (
            <div className={styles.downloadActions}>
              <Button variant="primary" onClick={startDownload}>
                Download now
              </Button>
              <Button variant="ghost" onClick={() => setDownload(1)}>
                Later
              </Button>
            </div>
          ) : download < 1 ? (
            <ProgressBar value={download} label="Downloading model…" />
          ) : (
            <p className={styles.ready}>Ready to grow your first tree 🌱</p>
          )}
        </div>
      )}
    </Modal>
  );
}
