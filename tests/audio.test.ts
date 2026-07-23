import { describe, expect, test } from 'bun:test';

import { PCM_SAMPLE_RATE, pcm16ToWav } from '../src/shared/audio';

/** Decode a data:audio/wav URL back into raw bytes for header assertions. */
function wavBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.replace(/^data:audio\/wav;base64,/, '');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

describe('pcm16ToWav', () => {
  test('returns null when no audio was streamed', () => {
    expect(pcm16ToWav([])).toBeNull();
    expect(pcm16ToWav(['', ''])).toBeNull();
  });

  test('wraps PCM16 chunks in a valid WAV container', () => {
    // Two chunks of two 16-bit samples each → 8 data bytes.
    const chunk = btoa(String.fromCharCode(0x01, 0x00, 0xff, 0x7f));
    const url = pcm16ToWav([chunk, chunk])!;
    expect(url).toStartWith('data:audio/wav;base64,');

    const bytes = wavBytes(url);
    expect(ascii(bytes, 0, 4)).toBe('RIFF');
    expect(ascii(bytes, 8, 4)).toBe('WAVE');
    expect(ascii(bytes, 12, 4)).toBe('fmt ');
    expect(ascii(bytes, 36, 4)).toBe('data');

    const view = new DataView(bytes.buffer);
    expect(view.getUint16(20, true)).toBe(1);   // PCM
    expect(view.getUint16(22, true)).toBe(1);   // mono
    expect(view.getUint32(24, true)).toBe(PCM_SAMPLE_RATE);
    expect(view.getUint16(34, true)).toBe(16);  // bits per sample

    const dataLength = 8;
    expect(view.getUint32(40, true)).toBe(dataLength);       // data size
    expect(view.getUint32(4, true)).toBe(36 + dataLength);   // RIFF size
    expect(bytes.length).toBe(44 + dataLength);              // header + data
  });

  test('accepts a custom sample rate', () => {
    const chunk = btoa(String.fromCharCode(0x00, 0x00));
    const bytes = wavBytes(pcm16ToWav([chunk], 48_000)!);
    expect(new DataView(bytes.buffer).getUint32(24, true)).toBe(48_000);
  });
});
