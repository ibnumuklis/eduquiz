import katex from "katex";
import "katex/dist/katex.min.css";
import { Fragment } from "react";

// $$ display $$ or $inline$ (content must not start/end with a space, so "Rp 5$ dan 6$" is left alone).
const MATH = /(\$\$[\s\S]+?\$\$|\$(?=\S)[^$\n]+?(?<=\S)\$)/g;

export function hasMath(text: string | null | undefined) {
  return !!text && /\$\$[\s\S]+?\$\$|\$(?=\S)[^$\n]+?(?<=\S)\$/.test(text);
}

/**
 * Renders text with LaTeX math between $…$ (inline) or $$…$$ (block), e.g. "Hitung $\frac{3}{4} + \sqrt{16}$".
 * Plain text stays plain (no HTML injection); only KaTeX output is inserted as HTML.
 */
export function MathText({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  if (!hasMath(text)) return <span className={className}>{text}</span>;
  const parts = text.split(MATH);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{p}</Fragment>;
        const display = p.startsWith("$$");
        const tex = display ? p.slice(2, -2) : p.slice(1, -1);
        const html = katex.renderToString(tex, { throwOnError: false, displayMode: display, output: "html", strict: "ignore", trust: false });
        return <span key={i} className={display ? "my-2 block overflow-x-auto" : undefined} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </span>
  );
}
