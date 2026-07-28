// foldSystemIntoUser rewrites an image request so the persona/shared prompt
// (normally a system message, which image models ignore) reaches the user
// turn the model actually conditions on.

import { afterEach, describe, expect, test } from 'bun:test';

import {
  foldSystemIntoUser, streamAgent, type ChatMessage,
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

describe('streamAgent inactivity timeout', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  const encode = (s: string) => new TextEncoder().encode(s);

  // A 200 response whose body never emits a byte, cancelled when the
  // request's AbortSignal fires — exactly how a real dead stream behaves.
  function stalledFetch(): void {
    globalThis.fetch = ((_url: string, init: RequestInit) => {
      const signal = init.signal!;
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          signal.addEventListener('abort', () =>
            c.error(new DOMException('aborted', 'AbortError')));
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    }) as unknown as typeof fetch;
  }

  // A response that streams the given SSE frames then closes.
  function scriptedFetch(frames: string[]): void {
    globalThis.fetch = (() => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          for (const f of frames) c.enqueue(encode(f));
          c.close();
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    }) as unknown as typeof fetch;
  }

  test('a stream that never emits a byte fails as Error("timeout")', async () => {
    stalledFetch();
    await expect(
      streamAgent('m', [], 'k', () => {}, { idleTimeoutMs: 20, maxAttempts: 1 }),
    ).rejects.toThrow('timeout');
  });

  test('a completing stream resolves and delivers its tokens', async () => {
    scriptedFetch([
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n',
      'data: [DONE]\n',
    ]);
    const tokens: string[] = [];
    await streamAgent('m', [], 'k', (t) => tokens.push(t),
      { idleTimeoutMs: 1000 });
    expect(tokens).toEqual(['hi']);
  });

  test('keepalive comment lines yield no tokens yet let the reply complete',
    async () => {
      // OpenRouter interleaves ": OPENROUTER PROCESSING" comments (which
      // rearm the idle watchdog byte-by-byte) with real data frames; the
      // parser must skip the comments and surface only the content.
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(encode(': OPENROUTER PROCESSING\n'));
          c.enqueue(encode(': OPENROUTER PROCESSING\n'));
          c.enqueue(encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n'));
          c.enqueue(encode('data: [DONE]\n'));
          c.close();
        },
      });
      globalThis.fetch = (() =>
        Promise.resolve(new Response(body, { status: 200 }))
      ) as unknown as typeof fetch;
      const tokens: string[] = [];
      await streamAgent('m', [], 'k', (t) => tokens.push(t),
        { idleTimeoutMs: 1000 });
      expect(tokens).toEqual(['ok']);
    });
});

describe('streamAgent retries transient failures', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  const encode = (s: string) => new TextEncoder().encode(s);
  const okBody = (frames: string[]) => new ReadableStream<Uint8Array>({
    start(c) { for (const f of frames) c.enqueue(encode(f)); c.close(); },
  });
  const doneFrames = [
    'data: {"choices":[{"delta":{"content":"ok"}}]}\n',
    'data: [DONE]\n',
  ];

  // Serves the queued responses in order (the last repeats) and counts calls.
  function queueFetch(makers: Array<() => Response>) {
    const calls = { n: 0 };
    globalThis.fetch = (() => {
      const make = makers[Math.min(calls.n, makers.length - 1)]!;
      calls.n += 1;
      return Promise.resolve(make());
    }) as unknown as typeof fetch;
    return calls;
  }

  test('a 429 is retried and the retry succeeds', async () => {
    const calls = queueFetch([
      () => new Response('{"error":{"message":"rate limited"}}', { status: 429 }),
      () => new Response(okBody(doneFrames), { status: 200 }),
    ]);
    const tokens: string[] = [];
    await streamAgent('m', [], 'k', (t) => tokens.push(t), { retryBaseMs: 1 });
    expect(tokens).toEqual(['ok']);
    expect(calls.n).toBe(2);
  });

  test('exhausting retries throws the upstream error detail', async () => {
    const calls = queueFetch([
      () => new Response('{"error":{"message":"upstream 503"}}', { status: 503 }),
    ]);
    await expect(
      streamAgent('m', [], 'k', () => {}, { retryBaseMs: 1, maxAttempts: 2 }),
    ).rejects.toThrow('upstream 503');
    expect(calls.n).toBe(2);
  });

  test('a non-retryable status (400) fails on the first attempt', async () => {
    const calls = queueFetch([
      () => new Response('{"error":{"message":"bad request"}}', { status: 400 }),
    ]);
    await expect(
      streamAgent('m', [], 'k', () => {}, { retryBaseMs: 1 }),
    ).rejects.toThrow('bad request');
    expect(calls.n).toBe(1);
  });

  test('never retries once a token has reached the caller', async () => {
    // First response streams a token then errors mid-body; replaying it would
    // duplicate the token, so streamAgent must give up after one attempt.
    const calls = queueFetch([
      () => {
        // Reader-driven so it never races a clock: the first read yields a
        // token, the second errors the stream mid-reply.
        let step = 0;
        return new Response(new ReadableStream<Uint8Array>({
          pull(c) {
            if (step++ === 0) {
              c.enqueue(encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n'));
            } else {
              c.error(new Error('drop'));
            }
          },
        }), { status: 200 });
      },
      () => new Response(okBody(doneFrames), { status: 200 }),
    ]);
    const tokens: string[] = [];
    await expect(
      streamAgent('m', [], 'k', (t) => tokens.push(t), { retryBaseMs: 1 }),
    ).rejects.toThrow();
    expect(tokens).toEqual(['hi']);
    expect(calls.n).toBe(1);
  });
});
