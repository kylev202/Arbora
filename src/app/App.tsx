import { useState } from "react";
import { AppRoutes } from "./router";
import { OnboardingModal } from "../features/onboarding/OnboardingModal";

const ONBOARDED_KEY = "arbora.onboarded";

/** Root component: routes + first-run onboarding overlay. */
function App() {
  const [onboarding, setOnboarding] = useState(() => localStorage.getItem(ONBOARDED_KEY) !== "1");

  function finishOnboarding() {
    localStorage.setItem(ONBOARDED_KEY, "1");
    setOnboarding(false);
  }

  return (
    <>
      <AppRoutes />
      <OnboardingModal open={onboarding} onFinish={finishOnboarding} />
    </>
  );
}

export default App;
