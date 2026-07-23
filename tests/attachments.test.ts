import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  importAttachment,
  importDataUrl,
  MAX_ATTACHMENT_BYTES,
  readAttachment,
} from '../src/main/attachments';

let dir: string; // stands in for userData
let src: string; // where picked files live

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'strophae-att-'));
  src = mkdtempSync(join(tmpdir(), 'strophae-src-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(src, { recursive: true, force: true });
});

describe('importAttachment', () => {
  test('markdown imports as inline text', async () => {
    const path = join(src, 'notes.md');
    writeFileSync(path, '# hello');
    const att = await importAttachment(dir, 1, path);
    expect(att).toMatchObject(
      { id: 1, name: 'notes.md', kind: 'text', mime: 'text/markdown' });
    expect(readAttachment(dir, att)).toBe('# hello');
  });

  test('csv imports as inline text', async () => {
    const path = join(src, 'data.csv');
    writeFileSync(path, 'a,b\n1,2');
    const att = await importAttachment(dir, 2, path);
    expect(att.kind).toBe('text');
    expect(readAttachment(dir, att)).toContain('1,2');
  });

  test('png imports as an image data URL', async () => {
    const path = join(src, 'pixel.png');
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    writeFileSync(path, bytes);
    const att = await importAttachment(dir, 3, path);
    expect(att.kind).toBe('image');
    expect(readAttachment(dir, att))
      .toBe(`data:image/png;base64,${bytes.toString('base64')}`);
  });

  test('pdf keeps raw bytes as a data URL', async () => {
    const path = join(src, 'doc.pdf');
    writeFileSync(path, '%PDF-1.4 fake');
    const att = await importAttachment(dir, 4, path);
    expect(att.kind).toBe('pdf');
    expect(readAttachment(dir, att))
      .toStartWith('data:application/pdf;base64,');
  });

  test('unsupported extensions are rejected', async () => {
    const path = join(src, 'tool.exe');
    writeFileSync(path, 'nope');
    expect(importAttachment(dir, 5, path)).rejects.toThrow('unsupported');
  });

  test('oversized files are rejected', async () => {
    const path = join(src, 'big.txt');
    writeFileSync(path, Buffer.alloc(MAX_ATTACHMENT_BYTES + 1));
    expect(importAttachment(dir, 6, path)).rejects.toThrow('too large');
  });
});

describe('importDataUrl (model-generated images)', () => {
  test('round-trips a generated png', () => {
    const bytes = Buffer.from([1, 2, 3]);
    const url = `data:image/png;base64,${bytes.toString('base64')}`;
    const att = importDataUrl(dir, 7, url);
    expect(att).toMatchObject(
      { kind: 'image', mime: 'image/png', name: 'image-7.png', size: 3 });
    expect(readAttachment(dir, att)).toBe(url);
  });

  test('round-trips a generated wav as an audio attachment', () => {
    const bytes = Buffer.from([0x52, 0x49, 0x46, 0x46]); // "RIFF"
    const url = `data:audio/wav;base64,${bytes.toString('base64')}`;
    const att = importDataUrl(dir, 10, url);
    expect(att).toMatchObject(
      { kind: 'audio', mime: 'audio/wav', name: 'audio-10.wav', size: 4 });
    expect(readAttachment(dir, att)).toBe(url);
  });

  test('rejects non-media payloads', () => {
    expect(() => importDataUrl(dir, 8, 'data:text/html;base64,PGI+'))
      .toThrow('unsupported');
    expect(() => importDataUrl(dir, 9, 'https://example.com/x.png'))
      .toThrow('unsupported');
  });
});
