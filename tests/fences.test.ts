import { describe, expect, test } from 'bun:test';

import { splitFences } from '../src/shared/fences';

describe('splitFences', () => {
  test('plain text stays a single segment', () => {
    expect(splitFences('hello\nworld')).toEqual(
      [{ type: 'text', content: 'hello\nworld' }]);
  });

  test('extracts a closed mermaid block', () => {
    const text = 'before\n```mermaid\ngraph TD; A-->B;\n```\nafter';
    expect(splitFences(text)).toEqual([
      { type: 'text', content: 'before' },
      { type: 'mermaid', content: 'graph TD; A-->B;' },
      { type: 'text', content: 'after' },
    ]);
  });

  test('an unterminated block stays raw text while streaming', () => {
    const text = 'intro\n```mermaid\ngraph TD; A--';
    expect(splitFences(text)).toEqual([{ type: 'text', content: text }]);
  });

  test('non-mermaid fences are untouched', () => {
    const text = '```js\n1\n```';
    expect(splitFences(text)).toEqual([{ type: 'text', content: text }]);
  });

  test('handles several diagrams in one reply', () => {
    const text = '```mermaid\nA\n```\nmid\n```mermaid\nB\n```';
    expect(splitFences(text).filter((s) => s.type === 'mermaid'))
      .toHaveLength(2);
  });
});
