import { useMemo } from "react";
import type { Subject, TreeData } from "../lib/types";
import { seededRng } from "../lib/rng";
import styles from "./Tree.module.css";
import forest from "./ForestTree.module.css";

/**
 * The home forest tree (redesign §3.2): ONE tree, each subject = one branch.
 * Branch length/thickness follows that subject's mastery; leaves are its
 * mastered (green) / learning (gold) concepts. Same hard rules as Tree:
 * only grows (callers pass achievement-max data), never red, seeded layout,
 * total leaf DOM capped ≤ 120. Clicking a branch opens the subject.
 */

// Global DOM budget across all subjects (Tree Metaphor risk table).
const MAX_TOTAL_LEAVES = 120;

export type ForestBranchData = {
  subject: Subject;
  tree: TreeData;
};

type Leaf = { x: number; y: number; r: number; kind: "green" | "gold" };
type Branch = {
  subject: Subject;
  pct: number;
  path: string;
  width: number;
  leaves: Leaf[];
  labelX: number;
  labelY: number;
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

export function ForestTree({
  branches: data,
  onOpenSubject,
  size = 420,
}: {
  branches: ForestBranchData[];
  onOpenSubject: (subjectId: string) => void;
  size?: number;
}) {
  const { W, H, groundY, trunkTopY, cx, branches } = useMemo(() => {
    const W = 480;
    const H = 320;
    const groundY = 292;
    const cx = W / 2;
    const trunkTopY = groundY - 96;

    const n = Math.max(data.length, 1);
    // Per-subject leaf budget so the total stays under the cap.
    const perGreen = Math.max(4, Math.floor((MAX_TOTAL_LEAVES * 0.7) / n));
    const perGold = Math.max(2, Math.floor((MAX_TOTAL_LEAVES * 0.3) / n));

    const branches: Branch[] = data.map((d, i) => {
      const rng = seededRng(d.subject.id);
      const pct = d.tree.mastery_pct;
      // Fan the branches across [-65°, +65°] from vertical, seeded jitter.
      const t = n === 1 ? 0.5 : i / (n - 1);
      const angle = lerp(-1.15, 1.15, t) + (rng() - 0.5) * 0.12;
      const len = lerp(70, 150, pct) * (0.92 + rng() * 0.16);
      const x1 = cx;
      const y1 = trunkTopY + 14 + (i % 2) * 10;
      const x2 = x1 + Math.sin(angle) * len;
      const y2 = y1 - Math.cos(angle) * len;
      // Gentle curve control point for an organic look.
      const cxq = x1 + Math.sin(angle) * len * 0.5 - Math.cos(angle) * 10;
      const cyq = y1 - Math.cos(angle) * len * 0.5 - Math.sin(angle) * 6;

      const leaves: Leaf[] = [];
      const clusterR = lerp(16, 40, pct);
      const place = (count: number, kind: Leaf["kind"]) => {
        for (let j = 0; j < count; j++) {
          const a = rng() * Math.PI * 2;
          const rad = Math.sqrt(rng()) * clusterR;
          leaves.push({
            x: x2 + Math.cos(a) * rad,
            y: y2 + Math.sin(a) * rad * 0.85,
            r: 3.4 + rng() * 2.6,
            kind,
          });
        }
      };
      const green = Math.min(d.tree.concepts_mastered, perGreen);
      const gold = Math.min(d.tree.concepts_learning, perGold);
      if (green + gold === 0) {
        place(2, "green"); // a sprouting branch, never bare
      } else {
        place(green, "green");
        place(gold, "gold");
      }

      return {
        subject: d.subject,
        pct,
        path: `M ${x1} ${y1} Q ${cxq} ${cyq} ${x2} ${y2}`,
        width: lerp(3.5, 9, pct),
        leaves,
        labelX: x2,
        labelY: y2 + clusterR + 14,
      };
    });

    return { W, H, groundY, trunkTopY, cx, branches };
  }, [data]);

  return (
    <div className={styles.wrap}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={size}
        height={(size * H) / W}
        role="img"
        aria-label={
          data.length === 0
            ? "A seedling, ready to grow with your first subject."
            : `Your tree with ${data.length} branches, one per subject.`
        }
        className={styles.svg}
      >
        <ellipse cx={cx} cy={groundY + 8} rx={150} ry={16} className={styles.ground} />
        <line x1={cx - 140} y1={groundY + 8} x2={cx + 140} y2={groundY + 8} className={styles.soil} />

        {/* shared trunk */}
        <path
          d={`M ${cx - 13} ${groundY}
              Q ${cx - 10} ${(groundY + trunkTopY) / 2} ${cx - 6} ${trunkTopY}
              L ${cx + 6} ${trunkTopY}
              Q ${cx + 10} ${(groundY + trunkTopY) / 2} ${cx + 13} ${groundY} Z`}
          className={styles.trunk}
        />

        {branches.map((b) => (
          <g
            key={b.subject.id}
            className={forest.branchGroup}
            role="link"
            tabIndex={0}
            aria-label={`${b.subject.name} — ${Math.round(b.pct * 100)}% mastered. Open subject.`}
            onClick={() => onOpenSubject(b.subject.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenSubject(b.subject.id);
              }
            }}
          >
            <path
              d={b.path}
              strokeWidth={b.width}
              fill="none"
              pathLength={1}
              className={`${styles.branch} ${forest.branchPath}`}
            />
            {b.leaves.map((l, i) => (
              <circle
                key={i}
                cx={l.x}
                cy={l.y}
                r={l.r}
                className={l.kind === "green" ? styles.leafGreen : styles.leafGold}
              />
            ))}
            <text x={b.labelX} y={b.labelY} className={forest.branchLabel} textAnchor="middle">
              {b.subject.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
