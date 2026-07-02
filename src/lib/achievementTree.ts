import type { TreeData } from "./types";

/** The tree is an achievement display — it must only grow, never regress.
 * We track the historical max mastery per subject in localStorage so lapses
 * (review→relearning) and new unlearned cards don't shrink the visual tree.
 * Shared by the subject dashboard tree and the home forest tree (same keys,
 * so both views always agree). */
function treeMaxKey(subjectId: string) {
  return `arbora_tree_max_${subjectId}`;
}

export function getAchievementTree(subjectId: string, live: TreeData): TreeData {
  let maxMastered = live.concepts_mastered;
  let maxPct = live.mastery_pct;
  try {
    const stored = localStorage.getItem(treeMaxKey(subjectId));
    if (stored) {
      const prev = JSON.parse(stored) as { mastered: number; pct: number };
      maxMastered = Math.max(prev.mastered, live.concepts_mastered);
      maxPct = Math.max(prev.pct, live.mastery_pct);
    }
    localStorage.setItem(treeMaxKey(subjectId), JSON.stringify({ mastered: maxMastered, pct: maxPct }));
  } catch {
    /* private mode / quota — fall back to live values */
  }
  return {
    ...live,
    concepts_mastered: maxMastered,
    mastery_pct: maxPct,
  };
}
