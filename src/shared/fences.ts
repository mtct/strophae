// Split assistant text around ```mermaid fenced blocks so the renderer
// can draw them as diagrams. Pure string work — no mermaid import here
// (the library is renderer-only and heavy; tests load this file).

export interface Segment {
  type: 'text' | 'mermaid';
  content: string;
}

/** An unterminated ```mermaid fence (mid-stream) stays raw text until the
    closing fence arrives, so diagrams appear only once complete. */
export function splitFences(text: string): Segment[] {
  const lines = text.split('\n');
  const segments: Segment[] = [];
  let buf: string[] = [];
  const flushText = () => {
    if (buf.length) segments.push({ type: 'text', content: buf.join('\n') });
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    if (!/^```mermaid\s*$/.test(lines[i]!)) {
      buf.push(lines[i]!);
      continue;
    }
    const close = lines.findIndex(
      (l, j) => j > i && /^```\s*$/.test(l));
    if (close < 0) {
      buf.push(lines[i]!); // still streaming — keep as text
      continue;
    }
    flushText();
    segments.push(
      { type: 'mermaid', content: lines.slice(i + 1, close).join('\n') });
    i = close;
  }
  flushText();
  return segments;
}
