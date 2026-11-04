import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_MODELS, defaultModality, isLocalServer, modelRoute, modelSlug,
  normalizeLocalServer, supportsAudioOutput, supportsImageOutput,
} from '../src/shared/models';

describe('modelRoute', () => {
  const models = [
    { label: 'GPT-4o', slug: 'openai/gpt-4o' },
    { label: 'Qwen', slug: 'qwen3:8b', provider: 'local' as const },
  ];

  test('a local entry goes to the local server under its own name', () => {
    expect(modelRoute('Qwen', models))
      .toEqual({ slug: 'qwen3:8b', provider: 'local' });
  });

  test('everything else goes to OpenRouter, as before local models', () => {
    expect(modelRoute('GPT-4o', models))
      .toEqual({ slug: 'openai/gpt-4o', provider: 'openrouter' });
    // A label no longer configured falls back the way modelSlug does.
    expect(modelRoute('o3', models))
      .toEqual({ slug: 'openai/o3', provider: 'openrouter' });
  });
});

describe('local server address', () => {
  test('a bare host and port gains the /v1 OpenAI-compatible servers use', () => {
    expect(normalizeLocalServer(' http://localhost:11434 '))
      .toBe('http://localhost:11434/v1');
    expect(normalizeLocalServer('http://localhost:1234/v1/'))
      .toBe('http://localhost:1234/v1');
    expect(normalizeLocalServer('http://box.local:8080/api/v1'))
      .toBe('http://box.local:8080/api/v1');
  });

  test('this machine and the private network are local', () => {
    for (const url of [
      'http://localhost:11434/v1', 'http://127.0.0.1:1234/v1',
      'http://[::1]:8080/v1', 'https://10.0.0.5/v1', 'http://172.20.1.1/v1',
      'http://192.168.1.20:11434/v1', 'http://169.254.3.4/v1',
      'http://[fd12::1]/v1', 'http://studio.local:11434/v1',
      'http://nas.lan/v1', 'http://gpu.home.arpa/v1', 'http://mybox:8000/v1',
    ]) {
      expect([url, isLocalServer(url)]).toEqual([url, true]);
    }
  });

  test('the internet, other schemes and credentials are not', () => {
    for (const url of [
      'https://api.openai.com/v1', 'http://8.8.8.8/v1', 'http://172.32.0.1/v1',
      'http://[2001:db8::1]/v1', 'ftp://localhost/v1', 'file:///etc/passwd',
      'http://user:pw@localhost/v1', 'localhost:11434', '',
      'http://localhost.evil.com/v1',
    ]) {
      expect([url, isLocalServer(url)]).toEqual([url, false]);
    }
  });
});

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

  test('audio-output heuristic spots speech models only', () => {
    expect(supportsAudioOutput('openai/gpt-audio-mini')).toBe(true);
    expect(supportsAudioOutput('some/model-tts')).toBe(true);
    expect(supportsAudioOutput('openai/gpt-4o')).toBe(false);
    expect(supportsAudioOutput('google/gemini-2.5-flash-image')).toBe(false);
  });

  test('defaultModality maps a slug to its most likely output', () => {
    expect(defaultModality('google/gemini-2.5-flash-image')).toBe('image');
    expect(defaultModality('openai/gpt-audio-mini')).toBe('audio');
    expect(defaultModality('anthropic/claude-sonnet-4')).toBe('text');
  });

  test('seed defaults all carry provider/model slugs', () => {
    expect(DEFAULT_MODELS.length).toBeGreaterThan(0);
    for (const m of DEFAULT_MODELS) {
      expect(m.slug).toMatch(/^[\w-]+\/[\w.-]+$/);
      expect(m.label.trim()).not.toBe('');
    }
  });
});
