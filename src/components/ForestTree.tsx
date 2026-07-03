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

type Pt = { x: number; y: number };
type Leaf = { x: number; y: number; r: number; kind: "green" | "gold" };
type Branch = {
  subject: Subject;
  pct: number;
  /** Centerline (used as the click hit-band). */
  path: string;
  /** Filled tapered outline (the visible main limb). */
  shape: string;
  /** Secondary limbs forking off the main one (filled, tapered). */
  twigs: string[];
  /** Soft foliage mass behind the main cluster, for canopy depth. */
  canopy: { x: number; y: number; rx: number; ry: number } | null;
  width: number;
  leaves: Leaf[];
  labelX: number;
  labelY: number;
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/** Point on a quadratic Bézier at parameter t. */
function quadPoint(p0: Pt, c: Pt, p2: Pt, t: number): Pt {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p2.y,
  };
}

/** Unit tangent of a quadratic Bézier at parameter t. */
function quadTangent(p0: Pt, c: Pt, p2: Pt, t: number): Pt {
  const dx = 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p2.x - c.x);
  const dy = 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p2.y - c.y);
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

/** A branch as a filled shape: thick at the trunk, tapering to a point at the
 * tip (two quadratics down each side) — reads like real bark, not a stick. */
function taperedBranchPath(
  x1: number,
  y1: number,
  cxq: number,
  cyq: number,
  x2: number,
  y2: number,
  wBase: number,
): string {
  const bdx = cxq - x1;
  const bdy = cyq - y1;
  const bl = Math.hypot(bdx, bdy) || 1;
  const bpx = -bdy / bl; // unit perpendicular at the base
  const bpy = bdx / bl;
  const mdx = x2 - x1;
  const mdy = y2 - y1;
  const ml = Math.hypot(mdx, mdy) || 1;
  const mpx = -mdy / ml; // unit perpendicular along the chord (mid)
  const mpy = mdx / ml;
  const hb = wBase / 2;
  const hm = wBase * 0.32; // narrower mid → gentle taper toward the tip
  const l0x = x1 + bpx * hb;
  const l0y = y1 + bpy * hb;
  const r0x = x1 - bpx * hb;
  const r0y = y1 - bpy * hb;
  const lcx = cxq + mpx * hm;
  const lcy = cyq + mpy * hm;
  const rcx = cxq - mpx * hm;
  const rcy = cyq - mpy * hm;
  return `M ${l0x} ${l0y} Q ${lcx} ${lcy} ${x2} ${y2} Q ${rcx} ${rcy} ${r0x} ${r0y} Z`;
}

export function ForestTree({
  branches: data,
  onOpenSubject,
  size = 680,
}: {
  branches: ForestBranchData[];
  onOpenSubject: (subjectId: string) => void;
  size?: number;
}) {
  const { W, H, groundY, trunkTopY, cx, branches, crown } = useMemo(() => {
    const W = 480;
    const H = 380;
    const groundY = 344;
    const cx = W / 2;
    const trunkTopY = groundY - 96;

    const n = Math.max(data.length, 1);
    // Per-subject leaf budget so the total stays under the cap.
    const perGreen = Math.max(4, Math.floor((MAX_TOTAL_LEAVES * 0.7) / n));
    const perGold = Math.max(2, Math.floor((MAX_TOTAL_LEAVES * 0.3) / n));

    const branches: Branch[] = data.map((d, i) => {
      const rng = seededRng(d.subject.id);
      const pct = d.tree.mastery_pct;
      // Fan the branches across [-60°, +60°] from vertical, seeded jitter.
      const t = n === 1 ? 0.5 : i / (n - 1);
      const angle = lerp(-1.05, 1.05, t) + (rng() - 0.5) * 0.1;
      const len = lerp(90, 190, pct) * (0.92 + rng() * 0.16);
      const x1 = cx;
      const y1 = trunkTopY + 14 + (i % 2) * 10;
      const x2 = x1 + Math.sin(angle) * len;
      const y2 = y1 - Math.cos(angle) * len;
      // Gentle curve control point for an organic look.
      const cxq = x1 + Math.sin(angle) * len * 0.5 - Math.cos(angle) * 10;
      const cyq = y1 - Math.cos(angle) * len * 0.5 - Math.sin(angle) * 6;

      const wBase = lerp(7, 15, pct);
      const p0 = { x: x1, y: y1 };
      const cc = { x: cxq, y: cyq };
      const p2 = { x: x2, y: y2 };
      const tipR = lerp(15, 34, pct);

      // Secondary limbs fork off longer branches → reads like a real limb, not
      // a stick. Each twig ends in its own small leaf tuft (below).
      const twigCount = len > 155 ? 2 : len > 110 ? 1 : 0;
      const twigs: string[] = [];
      const twigTips: { x: number; y: number; r: number }[] = [];
      for (let k = 0; k < twigCount; k++) {
        const tt = 0.6 + k * 0.16; // fork point along the main limb
        const base = quadPoint(p0, cc, p2, tt);
        const tan = quadTangent(p0, cc, p2, tt);
        const side = (i + k) % 2 === 0 ? 1 : -1;
        const twigAngle = Math.atan2(tan.y, tan.x) + side * (0.5 + rng() * 0.25);
        const twigLen = len * (0.3 + rng() * 0.12);
        const tx = base.x + Math.cos(twigAngle) * twigLen;
        const ty = base.y + Math.sin(twigAngle) * twigLen;
        const tcx = base.x + Math.cos(twigAngle) * twigLen * 0.5;
        const tcy = base.y + Math.sin(twigAngle) * twigLen * 0.5;
        twigs.push(taperedBranchPath(base.x, base.y, tcx, tcy, tx, ty, wBase * 0.5));
        twigTips.push({ x: tx, y: ty, r: tipR * 0.62 });
      }

      // Leaves clustered at each tip, in two green tones (+ gold for learning)
      // so the foliage has depth instead of a flat blob.
      const leaves: Leaf[] = [];
      const placeCluster = (ccx: number, ccy: number, r: number, gCount: number, goCount: number) => {
        const put = (count: number, kind: Leaf["kind"]) => {
          for (let j = 0; j < count; j++) {
            const a = rng() * Math.PI * 2;
            const rad = Math.sqrt(rng()) * r;
            leaves.push({
              x: ccx + Math.cos(a) * rad,
              y: ccy + Math.sin(a) * rad * 0.9,
              r: 3.6 + rng() * 2.8,
              kind,
            });
          }
        };
        put(gCount, "green");
        put(goCount, "gold");
      };

      const green = Math.min(d.tree.concepts_mastered, perGreen);
      const gold = Math.min(d.tree.concepts_learning, perGold);
      let canopy: Branch["canopy"] = null;
      if (green + gold === 0) {
        placeCluster(x2, y2, tipR, 2, 0); // a sprouting branch, never bare
      } else {
        let gLeft = green;
        let goLeft = gold;
        for (const tip of twigTips) {
          const gt = Math.min(gLeft, Math.max(2, Math.round(green * 0.16)));
          const got = Math.min(goLeft, Math.round(gold * 0.16));
          placeCluster(tip.x, tip.y, tip.r, gt, got);
          gLeft -= gt;
          goLeft -= got;
        }
        placeCluster(x2, y2, tipR, gLeft, goLeft); // main tip — the fullest
        if (green + gold >= 6) {
          canopy = { x: x2, y: y2, rx: tipR * 0.95, ry: tipR * 0.82 };
        }
      }

      return {
        subject: d.subject,
        pct,
        path: `M ${x1} ${y1} Q ${cxq} ${cyq} ${x2} ${y2}`,
        shape: taperedBranchPath(x1, y1, cxq, cyq, x2, y2, wBase),
        twigs,
        canopy,
        width: wBase,
        leaves,
        labelX: x2,
        labelY: y2 + tipR + 14,
      };
    });

    // A decorative crown of foliage at the treetop — fills the centre so the
    // branches read as one canopy dome. Structural (like the trunk), not leaves.
    const avgPct = data.length
      ? data.reduce((s, d) => s + d.tree.mastery_pct, 0) / data.length
      : 0;
    const crownRng = seededRng("crown");
    const crownCy = trunkTopY - lerp(70, 130, avgPct);
    const crownR = lerp(46, 78, avgPct);
    const crown: { x: number; y: number; rx: number; ry: number }[] = [];
    if (data.length > 0) {
      crown.push({ x: cx, y: crownCy, rx: crownR, ry: crownR * 0.82 });
      const puffs = 6;
      for (let k = 0; k < puffs; k++) {
        const a = (k / puffs) * Math.PI * 2;
        const rr = crownR * (0.42 + crownRng() * 0.24);
        crown.push({
          x: cx + Math.cos(a) * crownR * 0.55 * (0.7 + crownRng() * 0.5),
          y: crownCy + Math.sin(a) * crownR * 0.42 * (0.7 + crownRng() * 0.5),
          rx: rr,
          ry: rr * (0.8 + crownRng() * 0.18),
        });
      }
    }

    return { W, H, groundY, trunkTopY, cx, branches, crown };
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

        {/* shared trunk — flared roots at the base, slim waist, spreading top */}
        <path
          d={`M ${cx - 24} ${groundY}
              Q ${cx - 15} ${groundY - 6} ${cx - 9} ${(groundY + trunkTopY) / 2}
              Q ${cx - 7} ${trunkTopY + 14} ${cx - 8} ${trunkTopY}
              L ${cx + 8} ${trunkTopY}
              Q ${cx + 7} ${trunkTopY + 14} ${cx + 9} ${(groundY + trunkTopY) / 2}
              Q ${cx + 15} ${groundY - 6} ${cx + 24} ${groundY} Z`}
          className={styles.trunk}
        />

        {/* treetop crown — foliage dome behind the branches */}
        {crown.map((c, i) => (
          <ellipse
            key={i}
            cx={c.x}
            cy={c.y}
            rx={c.rx}
            ry={c.ry}
            className={styles.canopy}
          />
        ))}

        {branches.map((b) => (
          <g
            key={b.subject.id}
            className={forest.branchGroup}
            role="link"
            tabIndex={0}
            aria-label={`${b.subject.name}, ${Math.round(b.pct * 100)}% mastered. Open subject.`}
            onClick={() => onOpenSubject(b.subject.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenSubject(b.subject.id);
              }
            }}
          >
            {/* Invisible fat stroke: a generous hit band along the whole
                branch so the thin path + leaves are easy to click/tap. */}
            <path
              d={b.path}
              strokeWidth={Math.max(b.width + 24, 30)}
              fill="none"
              className={forest.branchHit}
            />
            <path d={b.shape} className={forest.branchShape} />
            {b.twigs.map((d, i) => (
              <path key={i} d={d} className={forest.branchShape} />
            ))}
            {b.canopy && (
              <ellipse
                cx={b.canopy.x}
                cy={b.canopy.y}
                rx={b.canopy.rx}
                ry={b.canopy.ry}
                className={styles.canopy}
              />
            )}
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
