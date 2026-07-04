import type { ReactNode } from "react";
import styles from "./NoteMarkdown.module.css";

/**
 * Minimal Markdown renderer for AI-generated study notes. The note format is
 * ours to constrain (see the walkthrough prompts), so this handles just the
 * subset we generate — headings, bold, inline code, bullet / numbered lists,
 * section-break rules, and paragraphs — with no dependency and no raw HTML.
 * It turns the raw `**`/`###` the model emits into real, styled structure.
 */

const isHr = (s: string) => /^([-*_])\1{2,}$/.test(s);
const isHeading = (s: string) => /^#{1,6}\s+\S/.test(s);
const isBullet = (s: string) => /^[-*]\s+\S/.test(s);
const isOrdered = (s: string) => /^\d+[.)]\s+\S/.test(s);
const isBlockStart = (s: string) => isHr(s) || isHeading(s) || isBullet(s) || isOrdered(s);

/** Inline: **bold** and `code`; everything else stays plain text. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+?)`/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={key++}>{m[1]}</strong>);
    else out.push(<code key={key++} className={styles.code}>{m[2]}</code>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function NoteMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === "") {
      i++;
      continue;
    }
    if (isHr(line)) {
      blocks.push(<hr key={key++} className={styles.rule} />);
      i++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const children = inline(h[2].trim());
      blocks.push(
        h[1].length <= 2 ? (
          <h3 key={key++} className={styles.h1}>
            {children}
          </h3>
        ) : (
          <h4 key={key++} className={styles.h2}>
            {children}
          </h4>
        ),
      );
      i++;
      continue;
    }
    if (isBullet(line)) {
      const items: string[] = [];
      while (i < lines.length && isBullet(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className={styles.list}>
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (isOrdered(line)) {
      const items: string[] = [];
      while (i < lines.length && isOrdered(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className={styles.list}>
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i].trim())) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push(
      <p key={key++} className={styles.p}>
        {inline(para.join(" "))}
      </p>,
    );
  }

  return <div className={styles.note}>{blocks}</div>;
}
