import { CaretRight } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { Fragment } from "react";
import styles from "./Breadcrumb.module.css";

export type Crumb = { label: string; to?: string };

/** Home > Subject > Tab. The last crumb is the current page (not a link). */
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className={styles.nav}>
      <ol className={styles.list}>
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${i}`}>
              <li className={styles.item}>
                {crumb.to && !last ? (
                  <Link to={crumb.to} className={styles.link}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={styles.current} aria-current={last ? "page" : undefined}>
                    {crumb.label}
                  </span>
                )}
              </li>
              {!last && (
                <li aria-hidden="true" className={styles.sep}>
                  <CaretRight />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
