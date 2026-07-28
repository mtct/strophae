// Assemble the base64 PCM16 chunks an audio model streams into a single
// playable WAV data URL. OpenAI/OpenRouter speech models emit 16-bit
// little-endian mono PCM at 24 kHz when format:'pcm16' is requested; we
// prepend a 44-byte WAV header so the reply plays in an <audio> element.
// Pure browser/Node-safe code (atob/btoa only) — no DOM, no Buffer — so it
// runs the same in the renderer that assembles it and under the test runner.

export const PCM_SAMPLE_RATE = 24_000;
const PCM_CHANNELS = 1;
const PCM_BITS = 16;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000; // stay within the argument limit of fromCharCode
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Concatenate the streamed PCM16 chunks and wrap them in a WAV container.
    Returns a data:audio/wav URL, or null when no audio was received. */
export function pcm16ToWav(
  chunks: string[], sampleRate = PCM_SAMPLE_RATE,
): string | null {
  const parts = chunks.filter(Boolean).map(base64ToBytes);
  const dataLength = parts.reduce((n, p) => n + p.length, 0);
  if (dataLength === 0) return null;

  const blockAlign = (PCM_CHANNELS * PCM_BITS) / 8;
  const byteRate = sampleRate * blockAlign;
  const out = new Uint8Array(44 + dataLength);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true); // chunk size
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);   // PCM subchunk size
  view.setUint16(20, 1, true);    // audio format = PCM
  view.setUint16(22, PCM_CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, PCM_BITS, true);
  ascii(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return `data:audio/wav;base64,${bytesToBase64(out)}`;
}
