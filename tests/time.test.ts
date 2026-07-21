import { describe, expect, test } from 'bun:test';

import { conversationGroups, groupKey, relTime } from '../src/shared/time';
import type { Conversation } from '../src/shared/types';

const NOW = new Date('2026-07-21T12:00:00Z');

function conv(id: number, updatedAt: string, withMessage = true): Conversation {
  return {
    id,
    title: `c${id}`,
    sharedSystemPrompt: '',
    createdAt: updatedAt,
    updatedAt,
    agents: [{
      id: id * 100,
      name: 'A',
      hue: 255,
      model: 'GPT-4o',
      personaType: 'generic',
      systemPrompt: '',
      order: 0,
      messages: withMessage
        ? [{ id: 1, role: 'user', text: 'hi', createdAt: updatedAt }]
        : [],
    }],
  };
}

describe('groupKey', () => {
  test('buckets by local midnight boundaries', () => {
    expect(groupKey('2026-07-21T08:00:00Z', NOW)).toBe('today');
    expect(groupKey('2026-07-20T22:00:00Z', NOW)).toBe('yesterday');
    expect(groupKey('2026-07-16T12:00:00Z', NOW)).toBe('week');
    expect(groupKey('2026-06-01T12:00:00Z', NOW)).toBe('earlier');
  });
});

describe('relTime', () => {
  test.each([
    ['2026-07-21T11:59:40Z', 'just_now', undefined],
    ['2026-07-21T11:15:00Z', 'm_ago', 45],
    ['2026-07-21T07:00:00Z', 'h_ago', 5],
    ['2026-07-20T10:00:00Z', 'yesterday_rel', undefined],
    ['2026-07-17T12:00:00Z', 'd_ago', 4],
    ['2026-06-21T12:00:00Z', 'w_ago', 4],
  ])('%s -> %s', (iso, key, n) => {
    expect(relTime(iso, NOW)).toEqual(
      n === undefined ? { key } : { key, n });
  });
});

describe('conversationGroups', () => {
  test('hides drafts and sorts groups stably', () => {
    const groups = conversationGroups([
      conv(1, '2026-06-01T12:00:00Z'),
      conv(2, '2026-07-21T09:00:00Z'),
      conv(3, '2026-07-21T10:00:00Z', false), // draft
    ], NOW);
    expect(groups.map((g) => g.id)).toEqual(['today', 'earlier']);
    expect(groups[0]!.items.map((c) => c.id)).toEqual([2]);
  });

  test('most recent first inside a bucket', () => {
    const groups = conversationGroups([
      conv(1, '2026-07-21T08:00:00Z'),
      conv(2, '2026-07-21T11:00:00Z'),
    ], NOW);
    expect(groups[0]!.items.map((c) => c.id)).toEqual([2, 1]);
  });
});
