import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import type { UnitInfo } from "../../lib/types";
import styles from "./UnitGlance.module.css";

/**
 * "Unit at a glance" + the mark map — the unit's own information, as the
 * syllabus states it. Everything here was extracted from the user's file and
 * accepted by them in a review gate; nothing is inferred, so a field the
 * syllabus never stated simply doesn't render.
 *
 * Collapsed by default past the headline row: this is reference material a
 * student reads once a term, not something to wade through on every visit.
 */
export function UnitGlance({ info }: { info: UnitInfo }) {
  const [open, setOpen] = useState(false);

  const headline = [info.credit_points, info.platform].filter(Boolean).join(" · ");
  const detail =
    info.aim ||
    info.assumed_knowledge ||
    info.outcomes.length > 0 ||
    info.staff.length > 0 ||
    info.classes.length > 0 ||
    info.assessments.length > 0;

  // Nothing worth a section: no code, no summary, no detail.
  if (!info.unit_code && !info.delivery_summary && !headline && !detail) return null;

  return (
    <section className={styles.card} aria-label="Unit information">
      <div className={styles.head}>
        <div className={styles.headText}>
          <h2 className={styles.title}>
            {info.unit_code ? `${info.unit_code} · Unit at a glance` : "Unit at a glance"}
          </h2>
          {headline && <p className={styles.headline}>{headline}</p>}
        </div>
        {detail && (
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            {open ? "Hide details" : "Show details"}
            <CaretDown
              className={`${styles.caret} ${open ? styles.caretOpen : ""}`}
              weight="bold"
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      {info.delivery_summary && <p className={styles.delivery}>{info.delivery_summary}</p>}

      {open && detail && (
        <div className={styles.detail}>
          {info.aim && (
            <Block title="Aim">
              <p className={styles.prose}>{info.aim}</p>
            </Block>
          )}

          {info.assumed_knowledge && (
            <Block title="Assumed knowledge">
              <p className={styles.prose}>{info.assumed_knowledge}</p>
            </Block>
          )}

          {info.outcomes.length > 0 && (
            <Block title="Learning outcomes">
              <ul className={styles.outcomes}>
                {info.outcomes.map((o) => (
                  <li key={o.id}>
                    {o.code && <span className={styles.outcomeCode}>{o.code}</span>}
                    <span>{o.text}</span>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {info.staff.length > 0 && (
            <Block title="Teaching team">
              <ul className={styles.rows}>
                {info.staff.map((s) => (
                  <li key={s.id} className={styles.staffRow}>
                    <span className={styles.staffName}>{s.name || s.role || "Staff"}</span>
                    {s.role && s.name && <span className={styles.muted}>{s.role}</span>}
                    {s.contact && <span className={styles.muted}>{s.contact}</span>}
                    {s.consultation && (
                      <span className={styles.muted}>Consults {s.consultation}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {info.classes.length > 0 && (
            <Block title="Classes">
              <ul className={styles.rows}>
                {info.classes.map((c) => (
                  <li key={c.id} className={styles.staffRow}>
                    <span className={styles.staffName}>{c.label || "Class"}</span>
                    {c.schedule && <span className={styles.muted}>{c.schedule}</span>}
                    {c.mode && <span className={styles.muted}>{c.mode}</span>}
                    {c.attendance && <span className={styles.attendance}>{c.attendance}</span>}
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {info.assessments.length > 0 && <MarkMap assessments={info.assessments} />}
        </div>
      )}
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.block}>
      <h3 className={styles.blockTitle}>{title}</h3>
      {children}
    </div>
  );
}

/**
 * The mark map: every assessed task with its weighting, when it's due, whether
 * it's group work, and what it maps to — plus a running total. The total is
 * computed here rather than stored, and a syllabus that omits weightings simply
 * shows none.
 */
function MarkMap({ assessments }: { assessments: UnitInfo["assessments"] }) {
  const total = assessments.reduce((sum, a) => sum + a.weight_percent, 0);
  const showOutcomes = assessments.some((a) => a.outcomes);
  const showKind = assessments.some((a) => a.kind);
  let running = 0;

  return (
    <div className={styles.block}>
      <h3 className={styles.blockTitle}>Mark map</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Assessment</th>
              <th scope="col" className={styles.num}>
                Weight
              </th>
              <th scope="col">Due</th>
              {showKind && <th scope="col">Type</th>}
              {showOutcomes && <th scope="col">Outcomes</th>}
              <th scope="col" className={styles.num}>
                Running
              </th>
            </tr>
          </thead>
          <tbody>
            {assessments.map((a) => {
              running += a.weight_percent;
              return (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td className={styles.num}>{a.weight_percent ? `${a.weight_percent}%` : "—"}</td>
                  <td>{a.due_text || "—"}</td>
                  {showKind && <td>{a.kind || "—"}</td>}
                  {showOutcomes && <td>{a.outcomes || "—"}</td>}
                  <td className={`${styles.num} ${styles.muted}`}>{Math.round(running)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* A total that isn't 100% usually means the syllabus split a task or the
          parse missed one — say so plainly rather than silently showing it. */}
      {total > 0 && Math.round(total) !== 100 && (
        <p className={styles.totalNote}>
          These add up to {Math.round(total)}%. Check your syllabus — a task may be missing or
          listed differently.
        </p>
      )}
    </div>
  );
}
