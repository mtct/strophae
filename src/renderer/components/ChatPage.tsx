import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { pcm16ToWav } from '../../shared/audio';
import { splitFences } from '../../shared/fences';
import { modelSlug } from '../../shared/models';
import { appendQuote, quotePassage } from '../../shared/quote';
import type {
  Agent, Attachment, Conversation, Message, ModelEntry,
} from '../../shared/types';
import { api } from '../api';
import type { T } from '../App';
import {
  inlineText, mediaParts, type AttachmentCache,
} from '../attachments';
import {
  foldSystemIntoUser, streamAgent,
  type ChatMessage, type ContentPart,
} from '../openrouter';
import { accent } from '../theme';
import {
  AttachButton, AttachmentChips, StoredAudio, StoredImage,
} from './Attachments';
import { Markdown } from './Markdown';
import { MermaidBlock } from './Mermaid';

/** Live streaming text per assistant slot id (not yet persisted). */
type LiveText = Record<number, string>;
/** Generated images per slot id, as data: URLs, while streaming. */
type LiveImages = Record<number, string[]>;
/** A passage selected inside one column: whose it is, and where the quote
    control should hang (above the selection when it sits near the foot of
    the window, below it otherwise). */
interface Picked {
  agentId: number;
  mine: boolean;
  text: string;
  x: number;
  y: number;
  up: boolean;
}

/** Assistant text rendered as markdown, with ```mermaid blocks split out
    and drawn as diagrams. */
function AssistantBody(props: { text: string }) {
  return (
    <>
      {splitFences(props.text).map((seg, i) =>
        seg.type === 'mermaid'
          ? <MermaidBlock key={i} code={seg.content} />
          : <Markdown key={i} text={seg.content} />)}
    </>
  );
}

function AgentColumn(props: {
  t: T;
  agent: Agent;
  live: LiveText;
  liveImages: LiveImages;
  liveAudio: Set<number>;
  streamingIds: Set<number>;
  streaming: boolean;
  hidden: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onStop: () => void;
  onClear: () => void;
  onToast: (msg: string) => void;
}) {
  const { t, agent } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  // Follow the stream only while the reader sits at the foot of the column:
  // scrolled up to lift a passage out of an older turn, the view has to
  // stay where it was put.
  const stick = useRef(true);

  useEffect(() => {
    const el = threadRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });

  const textOf = (m: Message): string =>
    m.id in props.live ? props.live[m.id]! : m.text;
  // Non-text output attached to a message: stored image/audio replies plus
  // whatever is still streaming into this slot.
  const mediaOf = (m: Message): number =>
    (m.attachments?.length ?? 0) + (props.liveImages[m.id]?.length ?? 0)
    + (props.liveAudio.has(m.id) ? 1 : 0);

  const visible = agent.messages.filter(
    (m) => m.role === 'user' || textOf(m) !== '' || mediaOf(m) > 0
      || props.streamingIds.has(m.id));

  return (
    <section
      className={`agent-column${props.hidden ? ' hidden' : ''}`}
      // Which voice a selection inside this column belongs to.
      data-agent={agent.id}
      // The spine colour, plus everything styles.css mixes from it.
      style={{ '--agent': accent(agent.hue) } as CSSProperties}
    >
      <header className="col-header">
        <span className="name">{agent.name}</span>
        <span className="model">{agent.model}</span>
        {props.streaming && (
          <button
            className="ghost stop-btn"
            title={t('stop_generation')}
            aria-label={t('stop_generation')}
            onClick={props.onStop}
          >
            <span className="stop-mark" />
          </button>
        )}
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
      <div
        className="thread"
        ref={threadRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {visible.length === 0 && (
          <div className="empty">{t('waiting')}</div>
        )}
        {visible.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="msg-user">
              {/* The call every voice answers, named as such: the prompt
                  repeats at the head of each column. */}
              <span className="turn-label">{t('you')}</span>
              <AttachmentChips t={t} attachments={m.attachments ?? []} />
              {m.text}
            </div>
          ) : (
            <div key={m.id}
                 className={`msg-assistant${
                   textOf(m) === '' && mediaOf(m) === 0 ? ' pending' : ''}`}>
              {textOf(m) !== '' && <AssistantBody text={textOf(m)} />}
              {(m.attachments ?? [])
                .filter((a) => a.kind === 'image')
                .map((a) => (
                  <StoredImage
                    key={a.id} att={a} t={t} onToast={props.onToast} />
                ))}
              {(m.attachments ?? [])
                .filter((a) => a.kind === 'audio')
                .map((a) => <StoredAudio key={a.id} att={a} />)}
              {(props.liveImages[m.id] ?? []).map((url, i) => (
                <img key={i} className="gen-img" src={url}
                     alt={`image ${i + 1}`} />
              ))}
              {props.liveAudio.has(m.id) && (
                <div className="gen-audio-pending">🔊 {t('generating_audio')}</div>
              )}
              {textOf(m) === '' && mediaOf(m) === 0 && (
                <span className="typing" role="status"
                      aria-label={t('generating_reply')}>
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </span>
              )}
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
  // Image models ignore the system role, so the persona/shared prompt is
  // folded into the user turn — otherwise editing it never changes the
  // picture. Text and audio models honour the system message as sent.
  return agent.modality === 'image' ? foldSystemIntoUser(payload) : payload;
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
  const [liveAudio, setLiveAudio] = useState<Set<number>>(new Set());
  const [streamingIds, setStreamingIds] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // A passage the reader has selected inside one column, and where to hang
  // the control that lifts it into the shared prompt.
  const [picked, setPicked] = useState<Picked | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // One live stream per agent, so a voice can be cut short on its own —
  // or all of them at once from the composer.
  const stoppers = useRef(new Map<number, AbortController>());

  // A removed agent (or a switched conversation) cannot stay expanded.
  const expanded = conv.agents.some((a) => a.id === expandedId)
    ? expandedId
    : null;

  useEffect(() => {
    setExpandedId(null);
    setPicked(null);
  }, [conv.id]);

  // The composer grows with a quoted passage rather than hiding it in a
  // one-line slot — up to a third of the window, then it scrolls.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(Math.max(el.scrollHeight + 2, 64), 260)}px`;
  }, [input]);

  // Selecting inside a column offers that passage to the whole council: the
  // control hangs under the selection and writes it into the shared prompt,
  // where one Send puts it to every agent at once.
  useEffect(() => {
    const readSelection = () => {
      const sel = window.getSelection();
      const text = sel?.toString() ?? '';
      if (!sel || sel.rangeCount === 0 || !text.trim()) return setPicked(null);
      const range = sel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const el = node instanceof Element ? node : node.parentElement;
      const column = el?.closest<HTMLElement>('.agent-column');
      // One voice at a time: a selection dragged across two columns has no
      // single speaker to attribute, so it offers nothing.
      if (!column || !el?.closest('.thread')) return setPicked(null);
      const rect = range.getBoundingClientRect();
      // Hang it under the selection, or above when the foot of the column
      // is too close — the control belongs over the sheet, not the
      // composer below it.
      const up = rect.bottom + 46 > column.getBoundingClientRect().bottom;
      setPicked({
        agentId: Number(column.dataset.agent),
        // Your own call repeats at the head of every column: quoted, it
        // stays yours instead of becoming something the agent said.
        mine: el.closest('.msg-user') !== null,
        text,
        x: Math.min(Math.max(rect.left + rect.width / 2, 90),
          window.innerWidth - 90),
        y: up ? rect.top - 8 : rect.bottom + 8,
        up,
      });
    };
    const onSettled = () => setTimeout(readSelection, 0);
    const onDown = (e: MouseEvent) => {
      // Pressing the control itself must not count as dismissing it.
      if (!popRef.current?.contains(e.target as Node)) setPicked(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPicked(null);
      else onSettled();
    };
    // A scrolled column would leave the control pointing at nothing.
    const onScroll = () => setPicked(null);
    document.addEventListener('mouseup', onSettled);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keyup', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mouseup', onSettled);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keyup', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  const pickedAgent = picked
    ? conv.agents.find((a) => a.id === picked.agentId)
    : undefined;

  /** Cut every voice short at once. Each stream resolves with whatever
      already arrived, so partial replies are kept, not thrown away. */
  function stopAll() {
    for (const stopper of stoppers.current.values()) stopper.abort();
  }

  /** Write the selected passage into the shared prompt, attributed, and
      leave the caret under it for the question that follows. */
  function liftPassage(speaker: string, text: string) {
    setInput((prev) => appendQuote(prev, quotePassage(speaker, text)));
    setPicked(null);
    window.getSelection()?.removeAllRanges();
    props.onToast(t('passage_quoted'));
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.scrollTop = el.scrollHeight;
    }, 0);
  }

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
    // Register a stopper per agent before the first await: a stop pressed
    // in the gap between Send and the first token still has to land, and an
    // already-aborted signal makes streamAgent return without asking.
    stoppers.current.clear();
    for (const agent of conv.agents) {
      stoppers.current.set(agent.id, new AbortController());
    }
    setInput('');
    const sentAtts = attached;
    setAttached([]);

    const result = await api.sendMessage(conv.id, text, sentAtts);
    await props.onChanged();
    setStreamingIds(new Set(Object.values(result.slotIds)));

    const cache: AttachmentCache = new Map();

    // Build every agent's request up front, in parallel, so the fetches can
    // all be dispatched in the same tick below — otherwise an agent whose
    // payload needs heavier attachment reads would fire (and start streaming)
    // noticeably later than the rest. A build failure becomes that agent's
    // own error banner, leaving the other columns untouched.
    const jobs = await Promise.all(
      result.conversation.agents.map(async (agent) => {
        const slotId = result.slotIds[agent.id]!;
        try {
          const payload = await buildPayload(
            result.conversation, agent, slotId, cache);
          return { agent, slotId, payload, buildError: null as Error | null };
        } catch (buildError) {
          return {
            agent, slotId, payload: [] as ChatMessage[],
            buildError: buildError as Error,
          };
        }
      }));

    let pending = jobs.length;
    // Dispatch is synchronous: streamAgent() runs its fetch() before the
    // first await, so every request leaves the renderer in one tick and the
    // columns start together (only the models' own latency staggers them).
    for (const { agent, slotId, payload, buildError } of jobs) {
      const slug = modelSlug(agent.model, props.models);
      const stopper = stoppers.current.get(agent.id) ?? new AbortController();
      stoppers.current.set(agent.id, stopper);
      const images: string[] = [];
      const audioChunks: string[] = [];
      let acc = '';
      const stream = buildError
        ? Promise.reject(buildError)
        : streamAgent(slug, payload, key, (token) => {
          acc += token;
          setLive((prev) => ({ ...prev, [slotId]: acc }));
        }, {
          modality: agent.modality,
          signal: stopper.signal,
          onImage: (url) => {
            images.push(url);
            setLiveImages((prev) => ({
              ...prev, [slotId]: [...(prev[slotId] ?? []), url],
            }));
          },
          onAudio: (chunk) => {
            audioChunks.push(chunk);
            setLiveAudio((prev) =>
              prev.has(slotId) ? prev : new Set(prev).add(slotId));
          },
        });
      stream
        .catch((err: Error) => {
          // A partial reply or generated media beats an error banner.
          const msg = err.message === 'timeout' ? t('stream_timeout')
            : err.message;
          if (!acc && images.length === 0 && audioChunks.length === 0) {
            acc = `⚠ ${msg}`;
          }
          setLive((prev) => ({ ...prev, [slotId]: acc }));
        })
        .finally(async () => {
          // Streamed PCM16 becomes one playable WAV persisted with the reply.
          const wav = pcm16ToWav(audioChunks);
          const media = wav ? [...images, wav] : images;
          stoppers.current.delete(agent.id);
          // Stopped before the model said anything: mark the turn, the way
          // an error marks it, rather than leaving a blank that vanishes.
          // Stopped mid-reply, the partial text *is* the reply.
          if (stopper.signal.aborted && !acc && media.length === 0) {
            acc = `⏹ ${t('stopped')}`;
            setLive((prev) => ({ ...prev, [slotId]: acc }));
          }
          await api.finalizeMessage(slotId, acc, media);
          setStreamingIds((prev) => {
            const next = new Set(prev);
            next.delete(slotId);
            return next;
          });
          setLiveAudio((prev) => {
            if (!prev.has(slotId)) return prev;
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
            liveAudio={liveAudio}
            streamingIds={streamingIds}
            hidden={expanded !== null && expanded !== agent.id}
            expanded={expanded === agent.id}
            streaming={agent.messages.some((m) => streamingIds.has(m.id))}
            onToggleExpand={() =>
              setExpandedId(expanded === agent.id ? null : agent.id)}
            onStop={() => stoppers.current.get(agent.id)?.abort()}
            onClear={async () => {
              if (sending) return;
              await api.clearThread(agent.id);
              props.onToast(t('thread_cleared'));
              await props.onChanged();
            }}
            onToast={props.onToast}
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
          ref={inputRef}
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
        {/* One stamped control, two jobs: while the chorus is speaking it
            stops every voice at once, then goes back to sending. */}
        <button
          className="accent"
          onClick={sending ? stopAll : send}
        >
          {sending ? t('stop_all') : t('send')}
        </button>
      </div>
      {picked && pickedAgent && (
        <div
          ref={popRef}
          className={`quote-pop${picked.up ? ' up' : ''}`}
          style={{
            left: picked.x,
            top: picked.y,
            '--agent': accent(pickedAgent.hue),
          } as CSSProperties}
        >
          <button
            title={t('quote_selection_hint')}
            // Keep the selection alive: pressing here must not collapse it.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => liftPassage(
              picked.mine ? t('you') : pickedAgent.name, picked.text)}
          >
            <span className="dot" />
            {t('quote_selection')}
          </button>
        </div>
      )}
    </main>
  );
}
