// OpenRouter streaming — the direct TypeScript port of the original web
// client's streamAgent(): fetch with stream:true, parse SSE lines, emit
// each delta token. The key goes only to OpenRouter.

import type { Modality } from '../shared/types';

// Multimodal content parts (OpenRouter chat/completions schema): images as
// base64 data URLs, PDFs as file parts. Text documents never appear as
// parts — they are inlined into prompt text before the call.
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

/** Voice for audio-output models; a neutral default is fine for all. */
export const DEFAULT_VOICE = 'alloy';

const joinText = (lead: string, body: string): string =>
  body ? `${lead}\n\n${body}` : lead;

/** Image-output models ignore the system role and condition only on the
    user turn, so a persona's system prompt would never reach the picture —
    editing it changes nothing. Fold every system message into the most
    recent user turn (adding one if the request has none) and drop the
    system messages. Returns a new array; the input is left untouched. */
export function foldSystemIntoUser(messages: ChatMessage[]): ChatMessage[] {
  const systemText = messages
    .filter((m) => m.role === 'system' && typeof m.content === 'string')
    .map((m) => m.content as string)
    .join('\n\n')
    .trim();
  const rest = messages.filter((m) => m.role !== 'system');
  if (!systemText) return rest;

  for (let i = rest.length - 1; i >= 0; i--) {
    const m = rest[i]!;
    if (m.role !== 'user') continue;
    if (typeof m.content === 'string') {
      rest[i] = { role: 'user', content: joinText(systemText, m.content) };
    } else {
      const parts = m.content.slice();
      const t = parts.findIndex((p) => p.type === 'text');
      if (t >= 0) {
        const part = parts[t] as { type: 'text'; text: string };
        parts[t] = { type: 'text', text: joinText(systemText, part.text) };
      } else {
        parts.unshift({ type: 'text', text: systemText });
      }
      rest[i] = { role: 'user', content: parts };
    }
    return rest;
  }
  // No user turn at all: carry the instruction in a fresh one.
  return [...rest, { role: 'user', content: systemText }];
}

export interface StreamOptions {
  /** What the agent should produce (default 'text'). Drives the request's
      `modalities`: 'image' asks for pictures, 'audio' asks for speech. */
  modality?: Modality;
  /** Fires once per generated image with its data: URL. */
  onImage?: (url: string) => void;
  /** Fires per streamed audio chunk with base64 PCM16 (format 'pcm16'). */
  onAudio?: (base64Pcm: string) => void;
  /** Abort the request if not a single byte arrives for this many ms and
      surface it as `Error('timeout')`. Reset on every chunk, so it is an
      *inactivity* deadline, not a total one — a slow-but-progressing reply
      is never cut off. OpenRouter emits `: OPENROUTER PROCESSING` keepalive
      comments during long generations (image models compute the whole
      picture before returning), and those bytes rearm the timer too, so
      this only trips on a genuinely dead connection. Default 120 s. */
  idleTimeoutMs?: number;
  /** Total attempts for a request that fails *before* delivering any output
      — a burst of a dozen personas trips OpenRouter rate limits (429) and
      upstream gateway timeouts (502/503/504/524), and one retry each clears
      most of them. Never retries once tokens/media have reached the caller
      (that would duplicate a partial reply). Default 3. */
  maxAttempts?: number;
  /** Initial backoff before the first retry (doubled with jitter each time);
      a 429's `Retry-After` header overrides it. Exposed mainly for tests. */
  retryBaseMs?: number;
  /** Stop the reply on demand (the column's stop control). Whatever has
      already streamed is the reply: aborting resolves normally, so the
      caller persists the partial text instead of an error, and no attempt
      is retried after it. */
  signal?: AbortSignal;
}

function requestModalities(modality: Modality): object {
  if (modality === 'image') return { modalities: ['image', 'text'] };
  if (modality === 'audio') {
    return {
      modalities: ['audio', 'text'],
      audio: { voice: DEFAULT_VOICE, format: 'pcm16' },
    };
  }
  return {};
}

// Transient upstream failures worth a second try: rate limiting and the
// gateway/edge timeouts OpenRouter and Cloudflare return under load.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 524]);

// A settled HTTP error (a non-retryable status, or a retryable one whose
// attempts are spent). Marks the failure as final so the connection-level
// retry path leaves it alone and reports it straight to the caller.
class FatalError extends Error {}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** Honour a 429's `Retry-After` (delta-seconds or HTTP date), capped so a
    hostile value can't stall a column; null when absent/unparseable. */
function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const secs = Number(header);
  const ms = Number.isFinite(secs)
    ? secs * 1000
    : Date.parse(header) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.min(ms, 10_000);
}

export async function streamAgent(
  slug: string,
  messages: ChatMessage[],
  key: string,
  onToken: (token: string) => void,
  options: StreamOptions = {},
): Promise<void> {
  const idleMs = options.idleTimeoutMs ?? 120_000;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseMs = options.retryBaseMs ?? 500;
  // Retry only until output reaches the caller: replaying a stream that has
  // already painted tokens/images would duplicate them, so once the column
  // shows anything a mid-stream failure is surfaced as-is, never retried.
  let progressed = false;
  const stopped = options.signal;

  for (let attempt = 1; ; attempt++) {
    // Stopped between attempts (or before the first): nothing left to ask.
    if (stopped?.aborted) return;
    // Inactivity watchdog: with a dozen personas firing at once, a provider
    // that accepts the connection but never streams (or dies mid-reply) would
    // otherwise hang the column forever — the fetch itself has no timeout.
    const controller = new AbortController();
    const onStop = () => controller.abort();
    stopped?.addEventListener('abort', onStop);
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const rearm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timedOut = true; controller.abort(); }, idleMs);
    };
    // Wait, then move to the next attempt; shared by both failure paths.
    const backoff = async (ms: number): Promise<void> => {
      await sleep(ms + Math.random() * baseMs);
    };

    rearm();
    try {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': 'https://strophae.app',
          'X-Title': 'strophae',
        },
        body: JSON.stringify({
          model: slug,
          stream: true,
          messages,
          ...requestModalities(options.modality ?? 'text'),
        }),
      });
      if (!resp.ok || !resp.body) {
        let detail = `HTTP ${resp.status}`;
        try {
          const j = await resp.json();
          detail = j?.error?.message || detail;
        } catch { /* keep the status */ }
        if (RETRYABLE_STATUS.has(resp.status) && attempt < maxAttempts) {
          await backoff(retryAfterMs(resp.headers.get('retry-after'))
            ?? baseMs * 2 ** (attempt - 1));
          continue;
        }
        throw new FatalError(detail); // settled: don't retry the connection
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        rearm(); // any byte — token or keepalive comment — resets the deadline
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') return;
          try {
            const delta = JSON.parse(data)?.choices?.[0]?.delta;
            if (delta?.content) { onToken(delta.content); progressed = true; }
            // Image-output models attach generated images to the delta as
            // [{type:'image_url', image_url:{url:'data:image/…'}}, …].
            for (const image of delta?.images ?? []) {
              const url = image?.image_url?.url;
              if (typeof url === 'string' && url.startsWith('data:image/')) {
                options.onImage?.(url);
                progressed = true;
              }
            }
            // Audio-output models stream delta.audio: a base64 PCM16 `data`
            // chunk and/or a `transcript` fragment shown live as text.
            const audio = delta?.audio;
            if (audio?.transcript) { onToken(audio.transcript); progressed = true; }
            if (typeof audio?.data === 'string' && audio.data) {
              options.onAudio?.(audio.data);
              progressed = true;
            }
          } catch { /* partial frame */ }
        }
      }
      return; // body ended (with or without a [DONE]) — the reply is complete
    } catch (err) {
      // Stopped on purpose: what already streamed *is* the reply. Not an
      // error, and never worth another attempt.
      if (stopped?.aborted) return;
      // A settled HTTP error is final — report it, never re-fetch. Only a
      // connection-level failure with no output yet (dead socket, our idle
      // abort, a network drop) is transient and worth another attempt.
      if (!(err instanceof FatalError)
        && !progressed && attempt < maxAttempts) {
        await backoff(baseMs * 2 ** (attempt - 1));
        continue;
      }
      // Our own abort surfaces as a stable 'timeout' the UI can localise;
      // anything else (HTTP error, network drop) propagates unchanged.
      throw timedOut ? new Error('timeout') : err;
    } finally {
      if (timer) clearTimeout(timer);
      stopped?.removeEventListener('abort', onStop);
    }
  }
}
