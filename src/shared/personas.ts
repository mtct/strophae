// The persona library shipped with a fresh install: Edward de Bono's Six
// Thinking Hats (one persona per hat) plus two media personas, Raffaello
// (image output) and Iggy (audio output). Names and prompts are i18n keys
// materialised once in the user's language when the store seeds them, then
// frozen as user content (FR-014) — exactly like the default agent.
//
// Hues approximate each hat with the palette the app already uses: accents
// are drawn at a fixed oklch lightness and chroma, so the achromatic hats
// (white, black) borrow the nearest readable hue rather than a literal one.

import type { MessageKey } from './i18n';
import type { Modality } from './types';

export interface SeedPersona {
  personaType: string;
  nameKey: MessageKey;
  promptKey: MessageKey;
  hue: number;
  /** Output this persona is created for; omitted means plain text. */
  modality?: Modality;
  /** Model label (from DEFAULT_MODELS) the modality needs; omitted means
      the store's default text model. */
  modelLabel?: string;
}

export const SIX_HATS: SeedPersona[] = [
  {
    personaType: 'white_hat',
    nameKey: 'hat_white_name',
    promptKey: 'hat_white_prompt',
    hue: 200, // cool and neutral, standing in for white
  },
  {
    personaType: 'red_hat',
    nameKey: 'hat_red_name',
    promptKey: 'hat_red_prompt',
    hue: 30,
  },
  {
    personaType: 'black_hat',
    nameKey: 'hat_black_name',
    promptKey: 'hat_black_prompt',
    hue: 285, // sober violet, standing in for black
  },
  {
    personaType: 'yellow_hat',
    nameKey: 'hat_yellow_name',
    promptKey: 'hat_yellow_prompt',
    hue: 100,
  },
  {
    personaType: 'green_hat',
    nameKey: 'hat_green_name',
    promptKey: 'hat_green_prompt',
    hue: 150,
  },
  {
    personaType: 'blue_hat',
    nameKey: 'hat_blue_name',
    promptKey: 'hat_blue_prompt',
    hue: 255,
  },
];

// Media personas: each carries the modality and the matching model label
// from DEFAULT_MODELS, so a fresh install has a ready-made image and audio
// agent without editing the model list first.
export const MEDIA_PERSONAS: SeedPersona[] = [
  {
    personaType: 'raffaello',
    nameKey: 'persona_raffaello_name',
    promptKey: 'persona_raffaello_prompt',
    hue: 340, // artist's magenta, unused by the hats
    modality: 'image',
    modelLabel: 'Gemini 2.5 Flash Image',
  },
  {
    personaType: 'iggy',
    nameKey: 'persona_iggy_name',
    promptKey: 'persona_iggy_prompt',
    hue: 60, // amber, unused by the hats
    modality: 'audio',
    modelLabel: 'GPT-4o Audio',
  },
];
