// OpenRouter streaming — the direct TypeScript port of the original web
// client's streamAgent(): fetch with stream:true, parse SSE lines, emit
// each delta token. The key goes only to OpenRouter.

// Multimodal content parts (OpenRouter chat/completions schema): images as
// base64 data URLs, PDFs as file parts. Text documents never appear as
// parts — they are inlined into prompt text before the call.
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface StreamOptions {
  /** Ask OpenRouter for image output (diffusion models). */
  imageOutput?: boolean;
  /** Fires once per generated image with its data: URL. */
  onImage?: (url: string) => void;
}

export async function streamAgent(
  slug: string,
  messages: ChatMessage[],
  key: string,
  onToken: (token: string) => void,
  options: StreamOptions = {},
): Promise<void> {
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': 'https://strophae.app',
      'X-Title': 'strophae',
    },
    body: JSON.stringify({
      model: slug,
      stream: true,
      messages,
      ...(options.imageOutput ? { modalities: ['image', 'text'] } : {}),
    }),
  });
  if (!resp.ok || !resp.body) {
    let detail = `HTTP ${resp.status}`;
    try {
      const j = await resp.json();
      detail = j?.error?.message || detail;
    } catch { /* keep the status */ }
    throw new Error(detail);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const delta = JSON.parse(data)?.choices?.[0]?.delta;
        if (delta?.content) onToken(delta.content);
        // Image-output models attach generated images to the delta as
        // [{type:'image_url', image_url:{url:'data:image/…'}}, …].
        for (const image of delta?.images ?? []) {
          const url = image?.image_url?.url;
          if (typeof url === 'string' && url.startsWith('data:image/')) {
            options.onImage?.(url);
          }
        }
      } catch { /* partial frame */ }
    }
  }
}
