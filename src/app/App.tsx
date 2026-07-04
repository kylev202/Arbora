import { useState } from "react";
import { AppRoutes } from "./router";
import { OnboardingModal } from "../features/onboarding/OnboardingModal";
import { Pet } from "../features/pet/Pet";
import { SourceViewerProvider } from "../features/drive/SourceViewerProvider";

const ONBOARDED_KEY = "arbora.onboarded";

/** Root component: routes + first-run onboarding overlay + the pet companion. */
function App() {
  const [onboarding, setOnboarding] = useState(() => localStorage.getItem(ONBOARDED_KEY) !== "1");

  function finishOnboarding() {
    localStorage.setItem(ONBOARDED_KEY, "1");
    setOnboarding(false);
  }

  return (
    <SourceViewerProvider>
      <AppRoutes />
      {!onboarding && <Pet />}
      <OnboardingModal open={onboarding} onFinish={finishOnboarding} />
    </SourceViewerProvider>
  );
}

export default App;
