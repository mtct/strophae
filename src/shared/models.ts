// OpenRouter models offered in the per-agent selector. The list users
// actually see lives in Settings.models (editable from the Settings
// modal); these are only the seed defaults, ported from the retired
// Django settings.

import type { ModelEntry } from './types';

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
];

/** Configured list first, then the seed defaults (so agents keep working
    after their model is removed from Settings), else the label itself —
    a raw OpenRouter string stays usable as a label. */
export function modelSlug(label: string, models: ModelEntry[] = []): string {
  return models.find((m) => m.label === label)?.slug
    ?? DEFAULT_MODELS.find((m) => m.label === label)?.slug
    ?? label;
}

/** Heuristic for diffusion/image-output models: when it matches, requests
    include modalities:["image","text"] so OpenRouter returns images.
    Streamed images are displayed regardless of this guess. */
export function supportsImageOutput(slug: string): boolean {
  return /image|flux|dall-e|imagen|diffusion|sdxl|photon|recraft/
    .test(slug.toLowerCase());
}

// Accent hue palette reused across agents and personas (chat/models.py).
export const HUE_PALETTE = [255, 150, 310, 60, 200, 30, 340, 100, 285, 20];

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
} as const;

export const TITLE_LIMIT = 46;

export function titleFrom(text: string): string {
  const t = text.trim();
  return t.length > TITLE_LIMIT ? `${t.slice(0, TITLE_LIMIT).trim()}…` : t;
}
