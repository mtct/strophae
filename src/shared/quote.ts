// Lifting a passage out of one voice's column and into the shared prompt,
// so the whole council answers the same excerpt. Pure string work: the
// renderer selects the text, this decides how it reads once quoted.

/** A passage marked the way a reply quotes an email: who said it, then
    every line ruled with `> `. Blank lines keep the mark and lose the
    space, so the block stays one quotation instead of breaking in two. */
export function quotePassage(speaker: string, passage: string): string {
  const selected = passage.replace(/\r\n?/g, '\n').trim();
  if (!selected) return '';
  const body = selected
    .split('\n')
    .map((line) => (line.trim() === '' ? '>' : `> ${line.trimEnd()}`))
    .join('\n');
  const who = speaker.trim();
  return who ? `> ${who}:\n${body}` : body;
}

/** Add a quotation to whatever the prompt box already holds, leaving a
    blank line under it for the question the user is about to type. */
export function appendQuote(input: string, quote: string): string {
  if (!quote) return input;
  const head = input.replace(/\s+$/, '');
  return `${head ? `${head}\n\n` : ''}${quote}\n\n`;
}
