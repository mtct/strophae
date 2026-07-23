// Attachment payloads live as flat files next to strophae.json — one file
// per attachment in userData/attachments/, named by id. Records
// (shared/types Attachment) live inside the JSON document; nothing here
// touches the network. Images and PDFs keep their raw bytes (`<id>.bin`);
// every document format is reduced to plain text at import time
// (`<id>.txt`) — .doc/.docx through word-extractor, the rest read as
// UTF-8 — so the renderer can inline it into prompts.

import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join } from 'node:path';

import WordExtractor from 'word-extractor';

import type { Attachment, AttachmentKind } from '../shared/types';

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export const PICK_EXTENSIONS =
  ['png', 'jpg', 'jpeg', 'pdf', 'md', 'txt', 'csv', 'doc', 'docx'];

const MIMES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument' +
    '.wordprocessingml.document',
};

function kindOf(ext: string): AttachmentKind {
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') return 'image';
  if (ext === '.pdf') return 'pdf';
  return 'text';
}

export function attachmentsDir(dir: string): string {
  return join(dir, 'attachments');
}

/** Ids arrive over IPC — coerce before touching the filesystem. */
function fileFor(dir: string, att: Pick<Attachment, 'id' | 'kind'>): string {
  const id = Math.floor(Number(att.id));
  if (!Number.isFinite(id)) throw new Error('bad attachment id');
  return join(attachmentsDir(dir), `${id}.${att.kind === 'text' ? 'txt' : 'bin'}`);
}

/** Copy/convert one picked file into the attachments dir. */
export async function importAttachment(
  dir: string, id: number, path: string,
): Promise<Attachment> {
  const ext = extname(path).toLowerCase();
  const mime = MIMES[ext];
  if (!mime) throw new Error(`unsupported type ${ext}`);
  const size = statSync(path).size;
  if (size > MAX_ATTACHMENT_BYTES) throw new Error('too large');
  const att: Attachment =
    { id, name: basename(path), mime, kind: kindOf(ext), size };
  mkdirSync(attachmentsDir(dir), { recursive: true });
  if (att.kind !== 'text') {
    copyFileSync(path, fileFor(dir, att));
  } else if (ext === '.doc' || ext === '.docx') {
    const doc = await new WordExtractor().extract(path);
    writeFileSync(fileFor(dir, att), doc.getBody(), 'utf-8');
  } else {
    writeFileSync(fileFor(dir, att), readFileSync(path, 'utf-8'), 'utf-8');
  }
  return att;
}

// Mimes a model may stream back as generated media, mapped to
// {extension, attachment kind}. Image models return image/*; audio models
// return the WAV the renderer assembles from PCM16 chunks (or a container
// the provider produced directly).
const DATA_URL_MEDIA: Record<string, { ext: string; kind: AttachmentKind }> = {
  'image/png': { ext: 'png', kind: 'image' },
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'image/gif': { ext: 'gif', kind: 'image' },
  'audio/wav': { ext: 'wav', kind: 'audio' },
  'audio/x-wav': { ext: 'wav', kind: 'audio' },
  'audio/mpeg': { ext: 'mp3', kind: 'audio' },
  'audio/mp3': { ext: 'mp3', kind: 'audio' },
  'audio/ogg': { ext: 'ogg', kind: 'audio' },
  'audio/webm': { ext: 'webm', kind: 'audio' },
};

/** Persist model-generated media (a data: URL streamed from OpenRouter) as
    an image or audio attachment, keyed off the mime type. */
export function importDataUrl(
  dir: string, id: number, dataUrl: string,
): Attachment {
  const match = /^data:([\w/+.-]+);base64,(.*)$/s.exec(dataUrl);
  const media = match && DATA_URL_MEDIA[match[1]!];
  if (!media) throw new Error('unsupported data url');
  const bytes = Buffer.from(match![2]!, 'base64');
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error('too large');
  const att: Attachment = {
    id,
    name: `${media.kind}-${id}.${media.ext}`,
    mime: match![1]!,
    kind: media.kind,
    size: bytes.length,
  };
  mkdirSync(attachmentsDir(dir), { recursive: true });
  writeFileSync(fileFor(dir, att), bytes);
  return att;
}

/** Payload for the renderer: plain text, or a data: URL for image/pdf. */
export function readAttachment(dir: string, att: Attachment): string {
  const file = fileFor(dir, att);
  if (att.kind === 'text') return readFileSync(file, 'utf-8');
  return `data:${att.mime};base64,${readFileSync(file).toString('base64')}`;
}

export function deleteAttachmentFiles(dir: string, atts: Attachment[]): void {
  for (const att of atts) {
    try {
      unlinkSync(fileFor(dir, att));
    } catch { /* already gone */ }
  }
}

/** Startup GC: drop files no conversation, agent or message references. */
export function sweepAttachments(dir: string, keep: Set<number>): void {
  let names: string[];
  try {
    names = readdirSync(attachmentsDir(dir));
  } catch {
    return; // nothing imported yet
  }
  for (const name of names) {
    const id = Number.parseInt(name, 10);
    if (Number.isFinite(id) && keep.has(id)) continue;
    try {
      unlinkSync(join(attachmentsDir(dir), name));
    } catch { /* raced */ }
  }
}
