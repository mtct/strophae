// The main-process side of local models (src/main/local.ts), against a real
// HTTP server standing in for Ollama: what the renderer's
// strophae-local:// request turns into, and what comes back.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { forwardToLocal, listLocalModels } from '../src/main/local';

let server: ReturnType<typeof Bun.serve>;
let base: string;
let lastBody = '';

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(req) {
      const path = new URL(req.url).pathname;
      if (req.method === 'GET' && path === '/v1/models') {
        return Response.json({
          object: 'list',
          data: [{ id: 'qwen3:8b' }, { id: 'gemma3:4b' }, { id: '' }, {}],
        });
      }
      if (req.method === 'POST' && path === '/v1/chat/completions') {
        lastBody = await req.text();
        const { model } = JSON.parse(lastBody);
        if (model === 'missing') {
          return Response.json(
            { error: { message: 'model "missing" not found' } },
            { status: 404 });
        }
        return new Response(
          'data: {"choices":[{"delta":{"content":"ciao"}}]}\n\ndata: [DONE]\n\n',
          { headers: { 'Content-Type': 'text/event-stream' } });
      }
      return new Response('nope', { status: 404 });
    },
  });
  base = `http://127.0.0.1:${server.port}/v1`;
});

afterAll(() => {
  server.stop(true);
});

const ask = (body: object, path = '/chat/completions', method = 'POST') =>
  new Request(`strophae-local://server${path}`, {
    method,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });

describe('forwardToLocal', () => {
  test('forwards a chat completion and streams the reply back', async () => {
    const resp = await forwardToLocal(
      ask({ model: 'qwen3:8b', stream: true, messages: [] }), base, 'en');
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toBe('text/event-stream');
    expect(await resp.text()).toContain('"content":"ciao"');
    expect(JSON.parse(lastBody)).toEqual(
      { model: 'qwen3:8b', stream: true, messages: [] });
  });

  test('stopping the reply aborts the request to the server', async () => {
    let upstream: AbortSignal | undefined;
    const endless = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new TextEncoder().encode('data: {}\n\n')); },
    });
    const resp = await forwardToLocal(ask({ model: 'x' }), base, 'en',
      async (_url, init) => {
        upstream = init?.signal ?? undefined;
        return new Response(endless);
      });
    const reader = resp.body!.getReader();
    await reader.read();
    expect(upstream!.aborted).toBe(false);
    await reader.cancel();
    expect(upstream!.aborted).toBe(true);
  });

  test("the server's own errors pass through for the column to show", async () => {
    const resp = await forwardToLocal(ask({ model: 'missing' }), base, 'en');
    expect(resp.status).toBe(404);
    expect((await resp.json()).error.message).toContain('not found');
  });

  test('only the chat completion path is reachable', async () => {
    expect((await forwardToLocal(ask({}, '/models', 'GET'), base, 'en')).status)
      .toBe(404);
    expect((await forwardToLocal(ask({}, '/embeddings'), base, 'en')).status)
      .toBe(404);
  });

  test('a server nobody runs is a retryable 502, said in the UI language',
    async () => {
      const resp = await forwardToLocal(
        ask({ model: 'x' }), 'http://127.0.0.1:9/v1', 'it');
      expect(resp.status).toBe(502);
      expect((await resp.json()).error.message)
        .toBe('Nessun server di modelli locale risponde a http://127.0.0.1:9/v1');
    });

  test('a server off the local network is never contacted', async () => {
    let called = false;
    const resp = await forwardToLocal(ask({ model: 'x' }),
      'https://api.example.com/v1', 'en', async () => {
        called = true;
        return new Response();
      });
    expect(resp.status).toBe(400);
    expect(called).toBe(false);
  });
});

describe('listLocalModels', () => {
  test('lists the ids the server offers, sorted, from the address as typed',
    async () => {
      expect(await listLocalModels(`http://127.0.0.1:${server.port}/`)).toEqual({
        ok: true, url: base, models: ['gemma3:4b', 'qwen3:8b'],
      });
    });

  test('an address that answers nothing, or is not local', async () => {
    expect(await listLocalModels('http://127.0.0.1:9')).toEqual({
      ok: false, url: 'http://127.0.0.1:9/v1', error: 'local_unreachable',
    });
    expect(await listLocalModels('https://api.example.com/v1')).toEqual({
      ok: false, url: 'https://api.example.com/v1', error: 'local_url_invalid',
    });
  });
});
