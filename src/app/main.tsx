import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

// Self-hosted fonts (local-first — no Google Fonts CDN). Inter for Latin UI,
// Be Vietnam Pro for Vietnamese coverage; both fall back to system-ui.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
// Space Grotesk: structural voice (--font-heading) — titles, stats, labels.
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
// Fraunces: display serif for emotional headings only (--font-display).
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/400-italic.css";

import App from "./App";
import { SettingsProvider } from "./settings";
import "../styles/tokens.css";
import "../styles/global.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SettingsProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SettingsProvider>
  </React.StrictMode>,
);
