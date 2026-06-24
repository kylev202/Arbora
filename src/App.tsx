import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

type SidecarStatus = { ready: boolean; base_url: string | null };
type SidecarEvent = { state: "starting" | "ready" | "crashed"; error?: string };

function App() {
  const [coreMsg, setCoreMsg] = useState("");
  const [dbRows, setDbRows] = useState<number | null>(null);
  const [sidecar, setSidecar] = useState<string>("starting…");

  useEffect(() => {
    invoke<number>("db_health")
      .then((n) => setDbRows(n))
      .catch((e) => {
        console.error(e);
        setDbRows(-1);
      });

    invoke<SidecarStatus>("sidecar_status").then((s) =>
      setSidecar(s.ready ? `ready @ ${s.base_url}` : "starting…"),
    );

    const unlisten = listen<SidecarEvent>("sidecar:status", (e) => {
      const p = e.payload;
      setSidecar(p.state === "crashed" ? `crashed: ${p.error ?? "unknown"}` : p.state);
      if (p.state === "ready") {
        invoke<SidecarStatus>("sidecar_status").then((s) =>
          setSidecar(`ready @ ${s.base_url}`),
        );
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  async function pingCore() {
    setCoreMsg(await invoke<string>("greet", { name: "Arbora" }));
  }

  return (
    <main className="container">
      <h1>Arbora 🌳</h1>
      <p className="tagline">Local-first study space — Phase 2 skeleton</p>

      <ul className="checks">
        <li>
          <span className="label">Database</span>
          <span className="status">
            {dbRows === null
              ? "checking…"
              : dbRows >= 1
                ? `migrated ✓ (settings row present)`
                : "error ✗"}
          </span>
        </li>
        <li>
          <span className="label">AI sidecar</span>
          <span className="status">{sidecar}</span>
        </li>
      </ul>

      <button type="button" onClick={pingCore}>
        Ping Rust core
      </button>
      {coreMsg && <p className="status">{coreMsg}</p>}
    </main>
  );
}

export default App;
