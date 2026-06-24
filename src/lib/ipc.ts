/**
 * Typed client for the Rust core's IPC surface.
 *
 * This is the single seam between the React UI and the Tauri core: the UI calls
 * these functions, never `invoke("...")` with a raw command name. Keeping the
 * command strings and their argument/return shapes in one place means a change
 * to a Rust command surfaces here as a type error instead of a runtime mystery.
 *
 * Mirror of `src-tauri/src/commands.rs`. When you add a command there, add its
 * wrapper here.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Snapshot of the Python AI sidecar, as reported by the Rust core. */
export type SidecarStatus = {
  ready: boolean;
  base_url: string | null;
};

/** Lifecycle transitions the core emits on the `sidecar:status` channel. */
export type SidecarEvent = {
  state: "starting" | "ready" | "crashed";
  error?: string;
};

/** Liveness ping of the Rust core. Returns the greeting it echoes back. */
export function greet(name: string): Promise<string> {
  return invoke<string>("greet", { name });
}

/** Number of rows in the settings table — proves the DB opened and migrated. */
export function dbHealth(): Promise<number> {
  return invoke<number>("db_health");
}

/** Current sidecar readiness + base URL. */
export function sidecarStatus(): Promise<SidecarStatus> {
  return invoke<SidecarStatus>("sidecar_status");
}

/**
 * Subscribe to sidecar lifecycle events. Returns the unlisten function; call it
 * on unmount. Resolves once the listener is registered.
 */
export function onSidecarStatus(
  handler: (event: SidecarEvent) => void,
): Promise<UnlistenFn> {
  return listen<SidecarEvent>("sidecar:status", (e) => handler(e.payload));
}
