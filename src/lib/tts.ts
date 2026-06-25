/**
 * Minimal text-to-speech hook (Workstream D — multi-modal, evidence-based; NOT
 * "learning styles"). Wraps the browser Web Speech API; a no-op where it's
 * unavailable. Phase 3 stub — a later phase can route to a local TTS engine.
 */

export function speak(text: string): void {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1;
  synth.speak(utter);
}

export function stopSpeaking(): void {
  window.speechSynthesis?.cancel();
}

export const ttsAvailable = typeof window !== "undefined" && "speechSynthesis" in window;
