// Sidebar recency logic, ported from the retired chat/services.py.
// Buckets are keyed by stable ids so grouping never changes with the
// language; labels are translated at render time.

import type { Conversation } from './types';

export type GroupId = 'today' | 'yesterday' | 'week' | 'earlier';

export interface Group {
  id: GroupId;
  items: Conversation[];
}

export function relTime(iso: string, now: Date = new Date()):
    { key: string; n?: number } {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return { key: 'just_now' };
  if (minutes < 60) return { key: 'm_ago', n: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: 'h_ago', n: hours };
  const days = Math.floor(hours / 24);
  if (days === 1) return { key: 'yesterday_rel' };
  if (days < 7) return { key: 'd_ago', n: days };
  return { key: 'w_ago', n: Math.floor(days / 7) };
}

export function groupKey(iso: string, now: Date = new Date()): GroupId {
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const day = 86400_000;
  const t = new Date(iso).getTime();
  if (t >= startToday.getTime()) return 'today';
  if (t >= startToday.getTime() - day) return 'yesterday';
  if (t >= startToday.getTime() - 7 * day) return 'week';
  return 'earlier';
}

const hasMessages = (c: Conversation) =>
  c.agents.some((a) => a.messages.length > 0);

/** Non-draft conversations bucketed by recency, most recent first. */
export function conversationGroups(conversations: Conversation[],
                                   now: Date = new Date()): Group[] {
  const order: GroupId[] = ['today', 'yesterday', 'week', 'earlier'];
  const buckets = new Map<GroupId, Conversation[]>(
    order.map((id) => [id, []]));
  const listed = conversations
    .filter(hasMessages)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const conv of listed) {
    buckets.get(groupKey(conv.updatedAt, now))!.push(conv);
  }
  return order
    .filter((id) => buckets.get(id)!.length > 0)
    .map((id) => ({ id, items: buckets.get(id)! }));
}
