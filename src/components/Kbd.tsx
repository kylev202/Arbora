import type { ReactNode } from "react";
import styles from "./Kbd.module.css";

/** A keyboard key hint, e.g. <Kbd>Space</Kbd>. Used in review/study shortcuts. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}
