// The renderer draws assistant replies through react-markdown with the same
// plugin stack as components/Markdown.tsx. These check the pipeline that the
// self-test's empty chat never exercises: GFM structures render, single
// newlines survive as breaks, and raw HTML from the (untrusted) model is not
// injected into the DOM.

import { createElement } from 'react';

import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

function render(md: string): string {
  return renderToStaticMarkup(
    createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm, remarkBreaks],
    }, md));
}

describe('markdown rendering', () => {
  test('headings, emphasis and lists become real elements', () => {
    const html = render('# Title\n\nA **bold** word.\n\n- one\n- two');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
  });

  test('GFM tables render', () => {
    const html = render('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>2</td>');
  });

  test('fenced code blocks render as pre > code', () => {
    const html = render('```js\nconst x = 1;\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('<code');
    expect(html).toContain('const x = 1;');
  });

  test('inline code renders', () => {
    expect(render('use `npm` here')).toContain('<code>npm</code>');
  });

  test('single newlines survive as line breaks', () => {
    expect(render('line one\nline two')).toContain('<br');
  });

  test('links render as anchors', () => {
    expect(render('[site](https://example.com)'))
      .toContain('href="https://example.com"');
  });

  test('raw HTML from the model is escaped, not injected', () => {
    const html = render('<img src=x onerror="alert(1)">');
    // No live element/attribute — the markup survives only as inert text.
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  test('javascript: link scheme is stripped', () => {
    // eslint-disable-next-line no-script-url
    expect(render('[x](javascript:alert(1))')).not.toContain('javascript:');
  });
});
