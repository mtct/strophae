// Mermaid rendering for assistant replies. The library is bundled by
// Bun.build (no CDN — the app stays self-contained); diagrams become
// inline SVG, so the strict CSP is untouched.
//
// Diagram source is LLM output, i.e. untrusted: mermaid runs at
// securityLevel 'strict', htmlLabels are disabled so the output is pure
// SVG (no foreignObject), and the result is passed through DOMPurify
// before touching the DOM. The renderer CSP (no inline script) is the
// final backstop.

import { useEffect, useState } from 'react';

import DOMPurify from 'dompurify';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'neutral',
  fontFamily: 'inherit',
  htmlLabels: false,
  flowchart: { htmlLabels: false },
});

let seq = 0;

/** Render to sanitised SVG text; throws on invalid diagram source. */
export async function renderMermaidSvg(code: string): Promise<string> {
  const { svg } = await mermaid.render(`strophae-mmd-${++seq}`, code);
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['style'],
  });
}

export function MermaidBlock(props: { code: string }) {
  const [svg, setSvg] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setSvg('');
    setFailed(false);
    renderMermaidSvg(props.code)
      .then((out) => alive && setSvg(out))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [props.code]);

  // Invalid source (or still rendering): show the raw definition.
  if (failed || !svg) return <pre className="fence">{props.code}</pre>;
  return (
    <div
      className="mermaid-block"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
