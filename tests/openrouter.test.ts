// foldSystemIntoUser rewrites an image request so the persona/shared prompt
// (normally a system message, which image models ignore) reaches the user
// turn the model actually conditions on.

import { describe, expect, test } from 'bun:test';

import {
  foldSystemIntoUser, type ChatMessage,
} from '../src/renderer/openrouter';

describe('foldSystemIntoUser', () => {
  test('prepends the system text to a string-content user turn', () => {
    const out = foldSystemIntoUser([
      { role: 'system', content: 'You are Raffaello.' },
      { role: 'user', content: 'a red bicycle' },
    ]);
    expect(out).toEqual([
      { role: 'user', content: 'You are Raffaello.\n\na red bicycle' },
    ]);
  });

  test('folds into the most recent user turn, not an earlier one', () => {
    const out = foldSystemIntoUser([
      { role: 'system', content: 'STYLE' },
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'second' },
    ]);
    expect(out.map((m) => m.content)).toEqual([
      'first', 'ok', 'STYLE\n\nsecond',
    ]);
    expect(out.every((m) => m.role !== 'system')).toBe(true);
  });

  test('folds into the text part of a multipart user turn', () => {
    const out = foldSystemIntoUser([
      { role: 'system', content: 'STYLE' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'make this nicer' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } },
        ],
      },
    ]);
    const parts = out[0]!.content as Array<{ type: string; text?: string }>;
    expect(parts[0]).toEqual({ type: 'text', text: 'STYLE\n\nmake this nicer' });
    expect(parts[1]!.type).toBe('image_url');
  });

  test('adds a text part when the multipart user turn has none', () => {
    const out = foldSystemIntoUser([
      { role: 'system', content: 'STYLE' },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } },
        ],
      },
    ]);
    const parts = out[0]!.content as Array<{ type: string; text?: string }>;
    expect(parts[0]).toEqual({ type: 'text', text: 'STYLE' });
    expect(parts[1]!.type).toBe('image_url');
  });

  test('joins multiple system messages', () => {
    const out = foldSystemIntoUser([
      { role: 'system', content: 'A' },
      { role: 'system', content: 'B' },
      { role: 'user', content: 'go' },
    ]);
    expect(out).toEqual([{ role: 'user', content: 'A\n\nB\n\ngo' }]);
  });

  test('creates a user turn when the request has none', () => {
    const out = foldSystemIntoUser([{ role: 'system', content: 'STYLE' }]);
    expect(out).toEqual([{ role: 'user', content: 'STYLE' }]);
  });

  test('with no system message it just drops nothing and returns the rest', () => {
    const input: ChatMessage[] = [{ role: 'user', content: 'hi' }];
    expect(foldSystemIntoUser(input)).toEqual(input);
  });

  test('does not mutate the input messages', () => {
    const input: ChatMessage[] = [
      { role: 'system', content: 'STYLE' },
      { role: 'user', content: 'go' },
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    foldSystemIntoUser(input);
    expect(input).toEqual(snapshot);
  });
});
