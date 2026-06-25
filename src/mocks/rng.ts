/**
 * Tiny seeded PRNG so the tree (and any seeded layout) is *stable but unique*
 * per subject_id — same subject renders the same branches/leaves every time,
 * different subjects differ. No deps (runs anywhere, weak machines included).
 */

/** Hash a string to a 32-bit seed (FNV-1a). */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience: a seeded RNG keyed off a string (e.g. subject_id). */
export function seededRng(key: string): () => number {
  return mulberry32(hashSeed(key));
}
