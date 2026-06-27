import { useEffect, useRef, useState } from "react";

let _counter = 0;

/** Renders a Mermaid diagram from its source code. Mermaid is loaded lazily
 *  via dynamic import so it doesn't bloat the initial bundle.
 *
 *  Falls back to a <pre> with the raw code when Mermaid cannot parse it,
 *  so the user can always see what was generated even if rendering fails.
 */
export function MermaidDiagram({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const id = `mermaid-render-${++_counter}`;

    import("mermaid")
      .then(({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, theme: "neutral" });
        return mermaid.render(id, code);
      })
      .then(({ svg }) => {
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <pre
        className={className}
        style={{ whiteSpace: "pre-wrap", fontSize: "var(--text-xs)", overflowX: "auto" }}
      >
        {code}
      </pre>
    );
  }

  return <div ref={ref} className={className} />;
}
