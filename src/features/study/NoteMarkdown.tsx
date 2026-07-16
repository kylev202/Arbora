import type { ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import katex from "katex";
import "katex/dist/katex.min.css";
import { MermaidDiagram } from "../../components";
import styles from "./NoteMarkdown.module.css";

/**
 * Minimal Markdown renderer for AI-generated study notes. The note format is
 * ours to constrain (see the walkthrough prompts), so this handles just the
 * subset we generate — headings, bold, inline code, bullet / numbered lists,
 * section-break rules, paragraphs, fenced code blocks, and LaTeX math (inline
 * `$…$` and block `$$…$$`) — with no dependency beyond KaTeX and no raw HTML
 * from the model. It turns the raw `**`/`###`/`$$` the model emits into real,
 * styled structure. Math is a *rendered aid*: the citation still grounds the
 * surrounding prose (law #1), the equation is typeset for the reader.
 */

const isHr = (s: string) => /^([-*_])\1{2,}$/.test(s);
const isHeading = (s: string) => /^#{1,6}\s+\S/.test(s);
const isBullet = (s: string) => /^[-*]\s+\S/.test(s);
const isOrdered = (s: string) => /^\d+[.)]\s+\S/.test(s);
const isFence = (s: string) => /^```/.test(s);
const isBlockMath = (s: string) => /^\$\$/.test(s);
const isImage = (s: string) => /^!\[[^\]]*\]\([^)]*\)$/.test(s);
const isBlockStart = (s: string) =>
  isHr(s) || isHeading(s) || isBullet(s) || isOrdered(s) || isFence(s) || isBlockMath(s) || isImage(s);

/** A source figure's path is a local file under the asset scope; a Tauri asset
 *  URL makes it loadable in the webview. (Non-local URLs never reach here — the
 *  sidecar strips any image that isn't a real extracted figure.) */
const figureSrc = (url: string) => (/^https?:\/\//i.test(url) ? url : convertFileSrc(url));

/** KaTeX → trusted HTML. `throwOnError: false` renders a malformed formula as
 * inline error text instead of crashing the whole note. */
function tex(src: string, displayMode: boolean): string {
  return katex.renderToString(src, { throwOnError: false, displayMode });
}

// Padded inline math (`$ x $`) tightened to `$x$` — the sidecar does this at
// generation time (mathfmt.py), but notes saved before that fix still carry the
// padded form small models emit. Mirrors mathfmt.py exactly: every minimal `$`
// pair is consumed leftmost (so a closing `$` can never open a false span), but
// only symmetric padding is rewritten — currency prose ("$5 and $10", "5$ to
// 10$") never puts a space after the `$`, so it stays verbatim.
const MATH_PAIR = /(?<!\$)\$(?!\$)((?:\\\$|[^$\n])+?)\$(?!\$)/g;
const tightenMath = (s: string) =>
  s.replace(MATH_PAIR, (pair, body: string) => {
    const tight = body.replace(/^[ \t]+|[ \t]+$/g, "");
    return tight && /^[ \t]/.test(body) && /[ \t]$/.test(body) ? `$${tight}$` : pair;
  });

/** Inline: **bold**, `code`, and $math$; everything else stays plain text. */
function inline(raw: string): ReactNode[] {
  const text = tightenMath(raw);
  const out: ReactNode[] = [];
  // code and math consume their whole span, so a `$` inside `code` never starts
  // math. Math requires non-space just inside the delimiters, so "$5 and $10"
  // in prose is not mistaken for a formula.
  const re =
    /\*\*(.+?)\*\*|`([^`]+?)`|\$(?!\s)((?:\\\$|[^$])+?)(?<!\s)\$|!\[([^\]]*)\]\(([^)]*)\)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={key++}>{m[1]}</strong>);
    else if (m[2] !== undefined)
      out.push(
        <code key={key++} className={styles.code}>
          {m[2]}
        </code>,
      );
    else if (m[3] !== undefined)
      out.push(
        <span
          key={key++}
          className={styles.math}
          dangerouslySetInnerHTML={{ __html: tex(m[3], false) }}
        />,
      );
    else out.push(<img key={key++} className={styles.inlineFigure} src={figureSrc(m[5])} alt={m[4]} />);
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
    const raw = lines[i];
    const line = raw.trim();
    if (line === "") {
      i++;
      continue;
    }
    // Fenced code block: ```lang … ``` — kept verbatim, no inline parsing. A
    // ```mermaid fence is a grounded diagram (a review-gated visual aid), so it
    // renders as a diagram rather than raw code.
    if (isFence(line)) {
      const lang = line.slice(3).trim().toLowerCase();
      const code: string[] = [];
      i++;
      while (i < lines.length && !isFence(lines[i].trim())) {
        code.push(lines[i]);
        i++;
      }
      i++; // consume the closing fence (or run off the end)
      blocks.push(
        lang === "mermaid" ? (
          <MermaidDiagram key={key++} code={code.join("\n")} className={styles.diagram} />
        ) : (
          <pre key={key++} className={styles.pre}>
            <code>{code.join("\n")}</code>
          </pre>
        ),
      );
      continue;
    }
    // Block math: $$ … $$ — either fenced across lines or on a single line.
    if (isBlockMath(line)) {
      const single = /^\$\$(.+)\$\$$/.exec(line);
      let src: string;
      if (single) {
        src = single[1].trim();
        i++;
      } else {
        const math: string[] = [line.replace(/^\$\$/, "")];
        i++;
        while (i < lines.length && !/\$\$\s*$/.test(lines[i])) {
          math.push(lines[i]);
          i++;
        }
        if (i < lines.length) {
          math.push(lines[i].replace(/\$\$\s*$/, ""));
          i++;
        }
        src = math.join("\n").trim();
      }
      blocks.push(
        <div
          key={key++}
          className={styles.mathBlock}
          dangerouslySetInnerHTML={{ __html: tex(src, true) }}
        />,
      );
      continue;
    }
    if (isHr(line)) {
      blocks.push(<hr key={key++} className={styles.rule} />);
      i++;
      continue;
    }
    // Standalone source figure (ADR-0012): ![caption](path) on its own line.
    const img = /^!\[([^\]]*)\]\(([^)]*)\)$/.exec(line);
    if (img) {
      const alt = img[1].trim();
      blocks.push(
        <figure key={key++} className={styles.figure}>
          <img src={figureSrc(img[2].trim())} alt={alt} />
          {alt && <figcaption className={styles.figcaption}>{alt}</figcaption>}
        </figure>,
      );
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
