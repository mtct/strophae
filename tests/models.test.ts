import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_MODELS, modelSlug, supportsImageOutput,
} from '../src/shared/models';

describe('modelSlug', () => {
  test('resolves through the configured list first', () => {
    const models = [{ label: 'My GPT', slug: 'openai/gpt-5' }];
    expect(modelSlug('My GPT', models)).toBe('openai/gpt-5');
  });

  test('a configured label overrides the seed default', () => {
    const models = [{ label: 'GPT-4o', slug: 'openai/gpt-4o-2024-11-20' }];
    expect(modelSlug('GPT-4o', models)).toBe('openai/gpt-4o-2024-11-20');
  });

  test('falls back to seed defaults for removed models', () => {
    expect(modelSlug('GPT-4o', [])).toBe('openai/gpt-4o');
  });

  test('an unknown label passes through as a raw OpenRouter string', () => {
    expect(modelSlug('mistralai/devstral-small', []))
      .toBe('mistralai/devstral-small');
  });

  test('image-output heuristic spots diffusion models only', () => {
    expect(supportsImageOutput('google/gemini-2.5-flash-image')).toBe(true);
    expect(supportsImageOutput('black-forest-labs/flux-1.1-pro')).toBe(true);
    expect(supportsImageOutput('openai/gpt-4o')).toBe(false);
    expect(supportsImageOutput('anthropic/claude-sonnet-4')).toBe(false);
  });

  test('seed defaults all carry provider/model slugs', () => {
    expect(DEFAULT_MODELS.length).toBeGreaterThan(0);
    for (const m of DEFAULT_MODELS) {
      expect(m.slug).toMatch(/^[\w-]+\/[\w.-]+$/);
      expect(m.label.trim()).not.toBe('');
    }
  });
});
