import { useMemo } from "react";
import type { TreeData } from "../lib/types";
import { seededRng } from "../mocks/rng";
import styles from "./Tree.module.css";

/**
 * The Arbora tree (Workstream E / Tree Metaphor). Parameterised layered SVG —
 * lightweight, runs on weak machines (no WebGL/canvas), capped at well under
 * 120 DOM nodes. HARD RULES encoded here:
 *   - Only grows. Never shrinks, never brown/falling leaves, never red.
 *   - Leaves = COUNT of mastered/learning concepts (monotonic); mastery_pct only
 *     scales trunk/canopy SIZE — so adding unlearned cards enlarges the frame
 *     but never shrinks the tree.
 *   - Layout is seeded by subject id → stable & unique per subject.
 */

const STAGE_BRANCHES = [0, 2, 4, 6, 9, 12];
// DOM budget: cap rendered leaves (real counts still shown in stats elsewhere).
const MAX_GREEN = 64;
const MAX_GOLD = 28;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

export function stageFor(masteryPct: number): number {
  if (masteryPct <= 0) return 0;
  if (masteryPct >= 0.95) return 5;
  if (masteryPct >= 0.75) return 4;
  if (masteryPct >= 0.5) return 3;
  if (masteryPct >= 0.25) return 2;
  return 1;
}

type Leaf = { x: number; y: number; r: number; kind: "green" | "gold" };

export type TreeProps = {
  data: TreeData;
  /** Seed for deterministic layout — pass the subject id. */
  seed: string;
  /** Pixel size of the square SVG. */
  size?: number;
  /** Hide the seedling/empty caption (e.g. inside a small card). */
  hideCaption?: boolean;
  className?: string;
};

export function Tree({ data, seed, size = 280, hideCaption, className }: TreeProps) {
  const { params, leaves, branches } = useMemo(() => {
    const rng = seededRng(seed);
    const pct = data.mastery_pct;
    const stage = stageFor(pct);

    const W = 240;
    const H = 280;
    const groundY = 250;
    const trunkHeight = lerp(28, 150, pct);
    const trunkWidth = lerp(8, 26, pct);
    const trunkTopY = groundY - trunkHeight;
    const canopyCx = W / 2;
    const canopyCy = trunkTopY - lerp(6, 26, pct);
    const canopyRx = lerp(34, 96, pct);
    const canopyRy = lerp(30, 84, pct);

    // Branches: seeded angles fanning out from the upper trunk.
    const branchCount = STAGE_BRANCHES[stage];
    const branches: { x1: number; y1: number; x2: number; y2: number; w: number }[] = [];
    for (let i = 0; i < branchCount; i++) {
      const t = branchCount === 1 ? 0.5 : i / (branchCount - 1);
      const side = i % 2 === 0 ? -1 : 1;
      const angle = (0.5 + (rng() - 0.5) * 0.5) * side; // radians-ish lean
      const y1 = lerp(trunkTopY + 10, canopyCy + 20, t);
      const len = lerp(18, 46, pct) * (0.7 + rng() * 0.5);
      branches.push({
        x1: canopyCx,
        y1,
        x2: canopyCx + Math.sin(angle) * len * side * -1 + side * len,
        y2: y1 - Math.cos(angle) * len * 0.6 - 6,
        w: Math.max(2, trunkWidth * 0.3),
      });
    }

    // Leaves: counts (capped) distributed within the canopy ellipse, seeded.
    const green = Math.min(data.concepts_mastered, MAX_GREEN);
    const gold = Math.min(data.concepts_learning, MAX_GOLD);
    const leaves: Leaf[] = [];
    const place = (count: number, kind: Leaf["kind"]) => {
      for (let i = 0; i < count; i++) {
        // sqrt for even area fill; jitter for organic feel — all seeded.
        const a = rng() * Math.PI * 2;
        const rad = Math.sqrt(rng());
        leaves.push({
          x: canopyCx + Math.cos(a) * rad * canopyRx,
          y: canopyCy + Math.sin(a) * rad * canopyRy,
          r: 4 + rng() * 3,
          kind,
        });
      }
    };
    if (stage === 0) {
      // Seedling: a couple of sprout leaves only.
      place(2, "green");
    } else {
      place(green, "green");
      place(gold, "gold");
    }

    const fruit: { x: number; y: number }[] = [];
    if (stage >= 4) {
      for (let i = 0; i < 4; i++) {
        const a = rng() * Math.PI * 2;
        const rad = 0.5 + rng() * 0.45;
        fruit.push({
          x: canopyCx + Math.cos(a) * rad * canopyRx,
          y: canopyCy + Math.sin(a) * rad * canopyRy,
        });
      }
    }

    return {
      params: { W, H, groundY, trunkWidth, trunkTopY, canopyCx, canopyCy, stage, fruit },
      leaves,
      branches,
    };
  }, [data, seed]);

  const { W, H, groundY, trunkWidth, trunkTopY, canopyCx, stage, fruit } = params;
  const masteredPct = Math.round(data.mastery_pct * 100);
  const ariaLabel =
    stage === 0
      ? "A seedling, ready to grow as you master cards."
      : `Your tree at stage ${stage} of 5 — ${data.concepts_mastered} concepts mastered, ${data.concepts_learning} learning (${masteredPct}% mastery).`;

  return (
    <div className={`${styles.wrap} ${className ?? ""}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={size}
        height={size}
        role="img"
        aria-label={ariaLabel}
        className={styles.svg}
      >
        {/* ground */}
        <ellipse cx={W / 2} cy={groundY + 8} rx={92} ry={14} className={styles.ground} />
        <line x1={W / 2 - 90} y1={groundY + 8} x2={W / 2 + 90} y2={groundY + 8} className={styles.soil} />

        {/* trunk: tapered shape */}
        <path
          d={`M ${canopyCx - trunkWidth / 2} ${groundY}
              Q ${canopyCx - trunkWidth / 2.5} ${(groundY + trunkTopY) / 2} ${canopyCx - trunkWidth / 3.2} ${trunkTopY}
              L ${canopyCx + trunkWidth / 3.2} ${trunkTopY}
              Q ${canopyCx + trunkWidth / 2.5} ${(groundY + trunkTopY) / 2} ${canopyCx + trunkWidth / 2} ${groundY} Z`}
          className={styles.trunk}
        />

        {/* branches */}
        {branches.map((b, i) => (
          <line
            key={i}
            x1={b.x1}
            y1={b.y1}
            x2={b.x2}
            y2={b.y2}
            strokeWidth={b.w}
            className={styles.branch}
          />
        ))}

        {/* leaves (green = mastered, gold = learning) */}
        {leaves.map((l, i) => (
          <circle
            key={i}
            cx={l.x}
            cy={l.y}
            r={l.r}
            className={l.kind === "green" ? styles.leafGreen : styles.leafGold}
          />
        ))}

        {/* fruit (stage >= 4) */}
        {fruit.map((f, i) => (
          <circle key={i} cx={f.x} cy={f.y} r={3.6} className={styles.fruit} />
        ))}
      </svg>
      {!hideCaption && (
        <p className={styles.caption}>
          {stage === 0
            ? "Plant your first card to grow your tree 🌱"
            : `${data.concepts_mastered} / ${data.concepts_total} concepts · ${masteredPct}%`}
        </p>
      )}
    </div>
  );
}
