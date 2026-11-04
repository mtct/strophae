// Local models: an OpenAI-compatible server on this machine or the private
// network — Ollama, LM Studio, llama.cpp's llama-server, vLLM — used in
// place of OpenRouter for the models marked local in Settings.
//
// The renderer never calls that server itself. It fetches
// strophae-local://server/chat/completions (LOCAL_SCHEME), and the main
// process answers by forwarding the request to the configured address and
// streaming the reply back as it comes. Three things follow: the renderer's
// CSP still names no host but openrouter.ai; no local server has to be told
// to allow CORS (LM Studio refuses it by default, Ollama refuses a file://
// page); and the renderer can reach one path on one server, never the rest
// of the network. Stopping a reply cancels the body, which closes the
// connection, which is how these servers know to stop generating (relay).
//
// Electron-free, so the tests drive it with the global fetch; main.ts hands
// it Electron's net.fetch, which has no five-minute headers timeout — a
// local model can take that long to load, or to wait its turn behind the
// rest of the council.

import { translate, type Lang } from '../shared/i18n';
import { isLocalServer, normalizeLocalServer } from '../shared/models';
import type { LocalModels } from '../shared/types';

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const answer = (status: number, message: string) =>
  Response.json({ error: { message } }, { status });

/** The server's reply, passed through chunk by chunk. When the person
    stops a reply, Electron cancels this stream; cancelling it aborts the
    upstream request, and the server stops generating. Neither half happens
    on its own: net.fetch does not abort when its body is cancelled, and the
    protocol request's own signal never fires — without this a stopped
    local model would run on to the end of its answer. A stop pressed while
    the model is still loading lands as soon as the reply begins. */
function relay(body: ReadableStream<Uint8Array>,
               upstream: AbortController): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      upstream.abort();
    },
  });
}

/** Answer one strophae-local:// request from the renderer: a chat
    completion, forwarded to `server` and streamed back. Failures come back
    as OpenAI-shaped errors in the person's language, so the column shows
    them like any other model error. */
export async function forwardToLocal(request: Request, server: string,
                                     lang: Lang, fetcher: Fetch = fetch)
    : Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method !== 'POST' || path !== '/chat/completions') {
    return answer(404, `Not found: ${request.method} ${path}`);
  }
  if (!isLocalServer(server)) {
    return answer(400, translate(lang, 'local_url_invalid'));
  }
  const abort = new AbortController();
  let upstream: Response;
  try {
    upstream = await fetcher(`${server}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await request.text(),
      signal: abort.signal,
    });
  } catch {
    // 502 is retried a couple of times (streamAgent), which also covers a
    // server still starting up.
    return answer(502, translate(lang, 'local_unreachable', { url: server }));
  }
  return new Response(upstream.body && relay(upstream.body, abort), {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: {
      'Content-Type': upstream.headers.get('content-type')
        ?? 'application/json',
    },
  });
}

/** The models a local server offers (GET /models), for Settings to add.
    Takes the address as typed, since the person looks before saving. */
export async function listLocalModels(url: string, fetcher: Fetch = fetch)
    : Promise<LocalModels> {
  const server = normalizeLocalServer(url);
  if (!isLocalServer(server)) {
    return { ok: false, url: server, error: 'local_url_invalid' };
  }
  try {
    const resp = await fetcher(`${server}/models`,
      { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const body = await resp.json() as { data?: { id?: unknown }[] };
    const models = (body.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string' && id !== '')
      .sort((a, b) => a.localeCompare(b));
    return { ok: true, url: server, models };
  } catch {
    return { ok: false, url: server, error: 'local_unreachable' };
  }
}
