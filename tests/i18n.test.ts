import { describe, expect, test } from 'bun:test';

import { CATALOGS, translate } from '../src/shared/i18n';

describe('catalogs', () => {
  test('italian covers every english key', () => {
    const en = Object.keys(CATALOGS.en).sort();
    const it = Object.keys(CATALOGS.it).sort();
    expect(it).toEqual(en);
  });

  test('no empty translations', () => {
    for (const lang of ['en', 'it'] as const) {
      for (const [key, value] of Object.entries(CATALOGS[lang])) {
        expect(value.length, `${lang}:${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('translate', () => {
  test('interpolates placeholders', () => {
    expect(translate('en', 'agent_n', { n: 3 })).toBe('Agent 3');
    expect(translate('it', 'agent_n', { n: 3 })).toBe('Agente 3');
  });

  test('falls back to english for missing entries', () => {
    expect(translate('it', 'default_agent_name')).toBe('Simple Jack');
  });
});
