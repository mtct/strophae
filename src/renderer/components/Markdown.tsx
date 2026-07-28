// Render an assistant reply's markdown as styled elements. react-markdown
// builds React nodes straight from the markdown AST — raw HTML in the model
// output is never parsed (no rehype-raw), so there is no injection surface.
// remark-gfm adds tables/task-lists/strikethrough/autolinks; remark-breaks
// keeps single newlines as line breaks (matching the old pre-wrap look of
// plain-text replies).

import type { ComponentPropsWithoutRef } from 'react';

import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import { api } from '../api';

// Links open in the OS browser, never in the app window (which stays pinned
// to the bundled index.html). react-markdown has already dropped dangerous
// URL schemes from href; the main process checks the scheme once more before
// handing it to the OS.
function MarkdownLink({ href, children }: ComponentPropsWithoutRef<'a'>) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href) void api.openExternal(href);
      }}
    >
      {children}
    </a>
  );
}

export function Markdown(props: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{ a: MarkdownLink }}
      >
        {props.text}
      </ReactMarkdown>
    </div>
  );
}
