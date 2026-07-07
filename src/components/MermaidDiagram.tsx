import { useEffect, useRef, useState } from "react";

let _counter = 0;
let _initialized = false;

/** Renders a Mermaid diagram from its source code. Mermaid is loaded lazily
 *  via dynamic import so it doesn't bloat the initial bundle.
 *
 *  The code is model-generated (untrusted): `securityLevel: "strict"` pins
 *  Mermaid's sanitizer explicitly — labels are sanitized, no click handlers or
 *  scripts — since the SVG lands in innerHTML (the app's only raw-HTML sink).
 *
 *  Falls back to a <pre> with the raw code when Mermaid cannot parse it,
 *  so the user can always see what was generated even if rendering fails.
 */
export function MermaidDiagram({
  code,
  className,
  label,
}: {
  code: string;
  className?: string;
  /** Accessible name for the rendered diagram (e.g. its generated title). */
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const id = `mermaid-render-${++_counter}`;

    import("mermaid")
      .then(({ default: mermaid }) => {
        if (!_initialized) {
          mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });
          _initialized = true;
        }
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

  // role="img" + label make the injected SVG one named graphic to assistive tech.
  return <div ref={ref} className={className} role="img" aria-label={label ?? "Diagram"} />;
}
