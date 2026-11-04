// OpenRouter models offered in the per-agent selector. The list users
// actually see lives in Settings.models (editable from the Settings
// modal); these are only the seed defaults, ported from the retired
// Django settings.

import type { Modality, ModelEntry, Provider } from './types';

export const DEFAULT_MODELS: ModelEntry[] = [
  { label: 'GPT-4o', slug: 'openai/gpt-4o' },
  { label: 'GPT-4o mini', slug: 'openai/gpt-4o-mini' },
  { label: 'o3', slug: 'openai/o3' },
  { label: 'Claude Opus 4.1', slug: 'anthropic/claude-opus-4.1' },
  { label: 'Claude Sonnet 4', slug: 'anthropic/claude-sonnet-4' },
  { label: 'Gemini 2.5 Pro', slug: 'google/gemini-2.5-pro' },
  { label: 'Llama 3.3 70B', slug: 'meta-llama/llama-3.3-70b-instruct' },
  { label: 'DeepSeek 4 Flash', slug: 'deepseek/deepseek-v4-flash' },
  { label: 'DeepSeek V3', slug: 'deepseek/deepseek-chat' },
  { label: 'Mistral Large', slug: 'mistralai/mistral-large' },
  // Image- and audio-output models, so a fresh install can pick a persona
  // for each modality without editing the list first.
  { label: 'Gemini 2.5 Flash Image', slug: 'google/gemini-2.5-flash-image' },
  { label: 'GPT Audio mini', slug: 'openai/gpt-audio-mini' },
];

/** Configured list first, then the seed defaults (so agents keep working
    after their model is removed from Settings), else the label itself —
    a raw OpenRouter string stays usable as a label. */
export function modelSlug(label: string, models: ModelEntry[] = []): string {
  return models.find((m) => m.label === label)?.slug
    ?? DEFAULT_MODELS.find((m) => m.label === label)?.slug
    ?? label;
}

/** Where a label's requests go, and the model string they carry. A label no
    longer configured falls back as modelSlug does — to OpenRouter. */
export function modelRoute(label: string, models: ModelEntry[] = [])
    : { slug: string; provider: Provider } {
  const entry = models.find((m) => m.label === label);
  return {
    slug: modelSlug(label, models),
    provider: entry?.provider ?? 'openrouter',
  };
}

// ------------------------------------------------------------ local server

/** Ollama's OpenAI-compatible endpoint, the most common local server. */
export const DEFAULT_LOCAL_SERVER = 'http://localhost:11434/v1';

/** The scheme the renderer calls a local model through. The main process
    answers it (src/main/local.ts) by forwarding to the configured server,
    so the renderer's CSP still names no host but OpenRouter, and no local
    server has to be told to allow CORS. */
export const LOCAL_SCHEME = 'strophae-local';

/** Tidy a pasted address: trimmed, no trailing slash, and the /v1 every
    OpenAI-compatible server (Ollama, LM Studio, llama.cpp, vLLM) serves
    under when the person gave just host and port. */
export function normalizeLocalServer(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(trimmed);
    return parsed.pathname === '/' ? `${trimmed}/v1` : trimmed;
  } catch {
    return trimmed;
  }
}

/** Whether `url` is a server on this machine or the private network —
    loopback, a private or link-local address, or a LAN name (one label, or
    .local / .lan / .home.arpa / .internal). Anything else would turn the
    "local" server into a way to send conversations to the internet past
    the renderer's CSP, so it is refused here and again in the main
    process. */
export function isLocalServer(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host.includes(':')) {
    // IPv6: loopback, unique-local (fc00::/7), link-local (fe80::/10).
    return host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host);
  }
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  return !host.includes('.')
    || /\.(localhost|local|lan|home\.arpa|internal)$/.test(host);
}

/** Heuristic for diffusion/image-output models: when it matches, requests
    include modalities:["image","text"] so OpenRouter returns images.
    Streamed images are displayed regardless of this guess. */
export function supportsImageOutput(slug: string): boolean {
  return /image|flux|dall-e|imagen|diffusion|sdxl|photon|recraft/
    .test(slug.toLowerCase());
}

/** Heuristic for speech/audio-output models (parallel to the image one). */
export function supportsAudioOutput(slug: string): boolean {
  return /audio|speech|tts|voice|realtime/.test(slug.toLowerCase());
}

/** The modality a model most likely produces, used only to seed the
    default when creating an agent — the user then sets it explicitly on
    the persona. */
export function defaultModality(slug: string): Modality {
  if (supportsImageOutput(slug)) return 'image';
  if (supportsAudioOutput(slug)) return 'audio';
  return 'text';
}

// Accent hue palette reused across agents and personas (chat/models.py).
// The three primaries lead, so a fresh council of three is blue, red and
// yellow — the triad the rest of the identity is built on.
export const HUE_PALETTE = [255, 30, 100, 150, 200, 310, 340, 60, 285, 20];

export function nextHue(used: number[]): number {
  for (const h of HUE_PALETTE) if (!used.includes(h)) return h;
  return HUE_PALETTE[used.length % HUE_PALETTE.length]!;
}

// The single neutral agent seeding every new session. Name and prompt are
// i18n keys materialised in the user's language at creation time, then
// frozen as user content (the retired app's FR-014).
export const DEFAULT_AGENT = {
  nameKey: 'default_agent_name',
  promptKey: 'default_agent_prompt',
  hue: 255,
  model: 'DeepSeek 4 Flash',
  personaType: 'generic',
  modality: 'text',
} as const;

export const TITLE_LIMIT = 46;

export function titleFrom(text: string): string {
  const t = text.trim();
  return t.length > TITLE_LIMIT ? `${t.slice(0, TITLE_LIMIT).trim()}…` : t;
}
