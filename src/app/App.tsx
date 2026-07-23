import { useEffect, useState } from "react";
import { AppRoutes } from "./router";
import { OnboardingModal } from "../features/onboarding/OnboardingModal";
import { TutorialModal } from "../features/onboarding/TutorialModal";
import { Pet } from "../features/pet/Pet";
import { SidecarBanner } from "./shell/SidecarBanner";
import { DeadlineBanner } from "./shell/DeadlineBanner";
import { SourceViewerProvider } from "../features/drive/SourceViewerProvider";
import { QuickNoteModal } from "../features/notes/QuickNoteModal";
import { useGlobalShortcuts } from "../lib/useGlobalShortcuts";
import { onOpenQuickNote } from "../lib/quickNote";

const ONBOARDED_KEY = "arbora.onboarded";
const TUTORIAL_KEY = "arbora.tutorialDone";

/** Root component: routes + first-run onboarding & tutorial overlays + the pet
 * companion. New users see onboarding, then a short how-to walkthrough; either
 * can be skipped, and both are recorded so they only appear once. */
function App() {
  const [onboarding, setOnboarding] = useState(() => localStorage.getItem(ONBOARDED_KEY) !== "1");
  // Show the tutorial to anyone already onboarded who hasn't seen it yet; new
  // users get it queued the moment onboarding finishes.
  const [tutorial, setTutorial] = useState(
    () => localStorage.getItem(ONBOARDED_KEY) === "1" && localStorage.getItem(TUTORIAL_KEY) !== "1",
  );
  const [quickNote, setQuickNote] = useState(false);

  // App-wide keyboard accelerators (g-chords, `/` for quick note).
  useGlobalShortcuts();
  // One quick-note island for the whole app; the top-bar button and the `/`
  // shortcut both open it through this signal.
  useEffect(() => onOpenQuickNote(() => setQuickNote(true)), []);

  function finishOnboarding() {
    localStorage.setItem(ONBOARDED_KEY, "1");
    setOnboarding(false);
    if (localStorage.getItem(TUTORIAL_KEY) !== "1") setTutorial(true);
  }

  function finishTutorial() {
    localStorage.setItem(TUTORIAL_KEY, "1");
    setTutorial(false);
  }

  return (
    <SourceViewerProvider>
      <AppRoutes />
      <SidecarBanner />
      {!onboarding && !tutorial && <DeadlineBanner />}
      {!onboarding && !tutorial && <Pet />}
      <QuickNoteModal open={quickNote} onClose={() => setQuickNote(false)} />
      <OnboardingModal open={onboarding} onFinish={finishOnboarding} />
      <TutorialModal open={!onboarding && tutorial} onFinish={finishTutorial} />
    </SourceViewerProvider>
  );
}

export default App;
