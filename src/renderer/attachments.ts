// Turn stored attachments into OpenRouter payload pieces. Payload bytes
// are fetched from the main process on demand and cached per send() so a
// file referenced by several agents crosses the bridge once.

import type { Attachment } from '../shared/types';
import { api } from './api';
import type { ContentPart } from './openrouter';

/** Guard rail so a huge CSV cannot swallow the whole context window. */
export const TEXT_INLINE_LIMIT = 150_000;

export type AttachmentCache = Map<number, Promise<string>>;

function dataOf(att: Attachment, cache: AttachmentCache): Promise<string> {
  let hit = cache.get(att.id);
  if (!hit) {
    hit = api.attachmentData(att);
    cache.set(att.id, hit);
  }
  return hit;
}

/** A text-kind document as a labelled block to splice into prompt text. */
export async function inlineText(
  att: Attachment, cache: AttachmentCache,
): Promise<string> {
  let text = await dataOf(att, cache);
  if (text.length > TEXT_INLINE_LIMIT) {
    text = `${text.slice(0, TEXT_INLINE_LIMIT)}\n[…truncated]`;
  }
  return `--- Attached file: ${att.name} ---\n${text}\n--- End of file ---`;
}

/** Image and PDF attachments as content parts (text kinds are skipped). */
export async function mediaParts(
  atts: Attachment[], cache: AttachmentCache,
): Promise<ContentPart[]> {
  const parts: ContentPart[] = [];
  for (const att of atts) {
    if (att.kind === 'image') {
      parts.push(
        { type: 'image_url', image_url: { url: await dataOf(att, cache) } });
    } else if (att.kind === 'pdf') {
      parts.push({
        type: 'file',
        file: { filename: att.name, file_data: await dataOf(att, cache) },
      });
    }
  }
  return parts;
}
