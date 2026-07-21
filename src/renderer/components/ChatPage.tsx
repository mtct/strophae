import { useEffect, useRef, useState } from 'react';

import { splitFences } from '../../shared/fences';
import { modelSlug, supportsImageOutput } from '../../shared/models';
import type {
  Agent, Attachment, Conversation, Message, ModelEntry,
} from '../../shared/types';
import { api } from '../api';
import type { T } from '../App';
import {
  inlineText, mediaParts, type AttachmentCache,
} from '../attachments';
import { streamAgent, type ChatMessage, type ContentPart } from '../openrouter';
import { accent, headerBg, soft } from '../theme';
import { AttachButton, AttachmentChips, StoredImage } from './Attachments';
import { MermaidBlock } from './Mermaid';

/** Live streaming text per assistant slot id (not yet persisted). */
type LiveText = Record<number, string>;
/** Generated images per slot id, as data: URLs, while streaming. */
type LiveImages = Record<number, string[]>;

/** Assistant text with ```mermaid blocks drawn as diagrams. */
function AssistantBody(props: { text: string }) {
  return (
    <>
      {splitFences(props.text).map((seg, i) =>
        seg.type === 'mermaid'
          ? <MermaidBlock key={i} code={seg.content} />
          : <span key={i}>{seg.content}</span>)}
    </>
  );
}

function AgentColumn(props: {
  t: T;
  agent: Agent;
  live: LiveText;
  liveImages: LiveImages;
  streamingIds: Set<number>;
  hidden: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onClear: () => void;
}) {
  const { t, agent } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  const textOf = (m: Message): string =>
    m.id in props.live ? props.live[m.id]! : m.text;
  const imagesOf = (m: Message): number =>
    (m.attachments?.length ?? 0) + (props.liveImages[m.id]?.length ?? 0);

  const visible = agent.messages.filter(
    (m) => m.role === 'user' || textOf(m) !== '' || imagesOf(m) > 0
      || props.streamingIds.has(m.id));

  return (
    <section className={`agent-column${props.hidden ? ' hidden' : ''}`}>
      <header className="col-header"
              style={{ background: headerBg(agent.hue) }}>
        <span className="dot" style={{ background: accent(agent.hue) }} />
        <span className="name">{agent.name}</span>
        <span className="model">{agent.model}</span>
        <button
          className="ghost expand-btn"
          title={t(props.expanded ? 'restore_chat' : 'expand_chat')}
          onClick={props.onToggleExpand}
        >
          {props.expanded ? '⤡' : '⤢'}
        </button>
        <div className="menu-anchor">
          <button className="ghost" onClick={() => setMenuOpen(!menuOpen)}>
            ⋯
          </button>
          {menuOpen && (
            <div className="menu" style={{ left: 'auto', right: 0 }}
                 onMouseLeave={() => setMenuOpen(false)}>
              <button onClick={() => {
                setMenuOpen(false);
                props.onClear();
              }}>
                {t('clear_thread')}
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="thread" ref={threadRef}>
        {visible.length === 0 && (
          <div className="empty">{t('waiting')}</div>
        )}
        {visible.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="msg-user"
                 style={{ background: soft(agent.hue) }}>
              <AttachmentChips t={t} attachments={m.attachments ?? []} />
              {m.text}
            </div>
          ) : (
            <div key={m.id}
                 className={`msg-assistant${
                   textOf(m) === '' && imagesOf(m) === 0 ? ' pending' : ''}`}>
              {textOf(m) !== '' && <AssistantBody text={textOf(m)} />}
              {(m.attachments ?? [])
                .filter((a) => a.kind === 'image')
                .map((a) => <StoredImage key={a.id} att={a} />)}
              {(props.liveImages[m.id] ?? []).map((url, i) => (
                <img key={i} className="gen-img" src={url}
                     alt={`image ${i + 1}`} />
              ))}
              {textOf(m) === '' && imagesOf(m) === 0 && '…'}
            </div>
          ))}
      </div>
    </section>
  );
}

/** One agent's request: system text (shared + own prompt + inlined text
    documents), a context message carrying conversation- and agent-level
    images/PDFs, then the thread history with each user message's files. */
async function buildPayload(
  conv: Conversation, agent: Agent, slotId: number, cache: AttachmentCache,
): Promise<ChatMessage[]> {
  const contextAtts =
    [...(conv.attachments ?? []), ...(agent.attachments ?? [])];
  const sys = [
    conv.sharedSystemPrompt.trim(),
    agent.systemPrompt.trim(),
  ].filter(Boolean);
  for (const att of contextAtts) {
    if (att.kind === 'text') sys.push(await inlineText(att, cache));
  }
  const context = await mediaParts(contextAtts, cache);

  const payload: ChatMessage[] = [];
  if (sys.length) payload.push({ role: 'system', content: sys.join('\n\n') });
  if (context.length) {
    payload.push({
      role: 'user',
      content: [
        { type: 'text', text: 'Reference files attached to this session.' },
        ...context,
      ],
    });
  }
  for (const m of agent.messages) {
    if (m.id === slotId) continue;
    const atts = m.attachments ?? [];
    // Assistant turns go back as text only: an image-only reply (its
    // pictures live as attachments) has nothing to send.
    if (m.text === '' && (m.role === 'assistant' || atts.length === 0)) {
      continue;
    }
    if (m.role === 'assistant' || atts.length === 0) {
      payload.push({ role: m.role, content: m.text });
      continue;
    }
    const texts = [m.text];
    for (const att of atts) {
      if (att.kind === 'text') texts.push(await inlineText(att, cache));
    }
    const parts: ContentPart[] = [
      { type: 'text', text: texts.filter(Boolean).join('\n\n') },
      ...await mediaParts(atts, cache),
    ];
    payload.push({ role: 'user', content: parts });
  }
  return payload;
}

export function ChatPage(props: {
  t: T;
  conv: Conversation;
  models: ModelEntry[];
  onChanged: () => void;
  onToast: (msg: string) => void;
  onEditAgents: () => void;
  onExpandChange: (expanded: boolean) => void;
}) {
  const { t, conv } = props;
  const [input, setInput] = useState('');
  const [attached, setAttached] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [live, setLive] = useState<LiveText>({});
  const [liveImages, setLiveImages] = useState<LiveImages>({});
  const [streamingIds, setStreamingIds] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // A removed agent (or a switched conversation) cannot stay expanded.
  const expanded = conv.agents.some((a) => a.id === expandedId)
    ? expandedId
    : null;

  useEffect(() => setExpandedId(null), [conv.id]);

  // The sidebar hides while a column fills the window; make sure it
  // comes back when the value changes or this page unmounts.
  useEffect(() => {
    props.onExpandChange(expanded !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);
  useEffect(() => () => props.onExpandChange(false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);

  useEffect(() => {
    if (expanded === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  async function send() {
    const text = input.trim();
    if ((!text && attached.length === 0) || sending) return;
    const key = await api.getApiKey();
    if (!key) {
      props.onToast(t('need_key'));
      return;
    }
    setSending(true);
    setInput('');
    const sentAtts = attached;
    setAttached([]);

    const result = await api.sendMessage(conv.id, text, sentAtts);
    await props.onChanged();
    setStreamingIds(new Set(Object.values(result.slotIds)));

    const cache: AttachmentCache = new Map();
    let pending = result.conversation.agents.length;
    for (const agent of result.conversation.agents) {
      const slotId = result.slotIds[agent.id]!;
      const slug = modelSlug(agent.model, props.models);
      const images: string[] = [];
      let acc = '';
      (async () => {
        const payload = await buildPayload(
          result.conversation, agent, slotId, cache);
        await streamAgent(slug, payload, key, (token) => {
          acc += token;
          setLive((prev) => ({ ...prev, [slotId]: acc }));
        }, {
          imageOutput: supportsImageOutput(slug),
          onImage: (url) => {
            images.push(url);
            setLiveImages((prev) => ({
              ...prev, [slotId]: [...(prev[slotId] ?? []), url],
            }));
          },
        });
      })()
        .catch((err: Error) => {
          // A partial reply or generated images beat an error banner.
          if (!acc && images.length === 0) acc = `⚠ ${err.message}`;
          setLive((prev) => ({ ...prev, [slotId]: acc }));
        })
        .finally(async () => {
          await api.finalizeMessage(slotId, acc, images);
          setStreamingIds((prev) => {
            const next = new Set(prev);
            next.delete(slotId);
            return next;
          });
          pending -= 1;
          if (pending === 0) {
            await props.onChanged();
            setLive({});
            setLiveImages({});
            setSending(false);
          }
        });
    }
  }

  async function exportMarkdown() {
    const lines = [`# ${conv.title}`, ''];
    for (const agent of conv.agents) {
      lines.push(`## ${agent.name} · ${agent.model}`, '');
      for (const m of agent.messages) {
        const files = (m.attachments ?? []).map((a) => `[${a.name}]`).join(' ');
        if (!m.text && !files) continue;
        const who = m.role === 'user' ? t('you') : agent.name;
        lines.push(
          `**${who}:** ${[files, m.text].filter(Boolean).join(' ')}`, '');
      }
    }
    await navigator.clipboard.writeText(lines.join('\n'));
    props.onToast(t('copied_markdown'));
  }

  return (
    <main className="page chat-page">
      <header className="chat-header">
        <h1>{conv.title}</h1>
        <button onClick={props.onEditAgents}>{t('edit_agents')}</button>
        <button onClick={exportMarkdown}>{t('export')}</button>
      </header>
      <div className="columns">
        {conv.agents.map((agent) => (
          <AgentColumn
            key={agent.id}
            t={t}
            agent={agent}
            live={live}
            liveImages={liveImages}
            streamingIds={streamingIds}
            hidden={expanded !== null && expanded !== agent.id}
            expanded={expanded === agent.id}
            onToggleExpand={() =>
              setExpandedId(expanded === agent.id ? null : agent.id)}
            onClear={async () => {
              if (sending) return;
              await api.clearThread(agent.id);
              props.onToast(t('thread_cleared'));
              await props.onChanged();
            }}
          />
        ))}
      </div>
      {attached.length > 0 && (
        <div className="attach-row">
          <AttachmentChips
            t={t}
            attachments={attached}
            onRemove={async (att) => {
              await api.discardAttachment(att);
              setAttached((prev) => prev.filter((a) => a.id !== att.id));
            }}
          />
        </div>
      )}
      <div className="input-row">
        <AttachButton
          t={t}
          compact
          onPicked={(atts) => setAttached((prev) => [...prev, ...atts])}
          onToast={props.onToast}
        />
        <textarea
          value={input}
          placeholder={t('input_placeholder')}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="accent" disabled={sending} onClick={send}>
          {t('send')}
        </button>
      </div>
    </main>
  );
}
