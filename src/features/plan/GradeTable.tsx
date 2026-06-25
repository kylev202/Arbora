import type { Grade, GradeSummary } from "../../lib/types";
import styles from "./GradeTable.module.css";

/** Grade book with current average + what-if GPA rows (S-07). */
export function GradeTable({ grades, summary }: { grades: Grade[]; summary: GradeSummary }) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Name</th>
            <th scope="col" className={styles.num}>
              Score
            </th>
            <th scope="col" className={styles.num}>
              Max
            </th>
            <th scope="col" className={styles.num}>
              Weight
            </th>
          </tr>
        </thead>
        <tbody>
          {grades.map((g) => (
            <tr key={g.id}>
              <td>{g.category}</td>
              <td>{g.name}</td>
              <td className={styles.num}>{g.score ?? "—"}</td>
              <td className={styles.num}>{g.max_score}</td>
              <td className={styles.num}>{Math.round(g.weight * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.summary}>
        <div className={styles.avg}>
          <span className={styles.avgLabel}>Current average</span>
          <span className={styles.avgValue}>
            {summary.current_average != null ? summary.current_average.toFixed(1) : "—"}
            {summary.gpa != null && <span className={styles.gpa}> · GPA {summary.gpa.toFixed(1)}</span>}
          </span>
        </div>

        {summary.what_if.length > 0 && (
          <div className={styles.whatIf}>
            <span className={styles.whatIfLabel}>What-if</span>
            <ul className={styles.whatIfList}>
              {summary.what_if.map((w) => (
                <li key={w.label}>
                  {w.label} → <strong>{w.gpa.toFixed(1)}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
