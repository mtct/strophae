import { useCallback, useEffect, useRef, useState } from 'react';

import { translate, type Lang, type MessageKey } from '../shared/i18n';
import type { AppState, Conversation } from '../shared/types';
import { api } from './api';
import { ChatPage } from './components/ChatPage';
import { ComposePage } from './components/ComposePage';
import { renderMermaidSvg } from './components/Mermaid';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar } from './components/Sidebar';

type View = { page: 'compose' | 'chat'; convId: number };

export type T = (key: MessageKey, vars?: Record<string, string | number>)
  => string;

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lang: Lang = state
    ? (state.settings.language || state.osLanguage)
    : 'en';
  const t: T = useCallback(
    (key, vars) => translate(lang, key, vars), [lang]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }, []);

  const reload = useCallback(async () => {
    setState(await api.getState());
  }, []);

  const openDraft = useCallback(async () => {
    const draft = await api.getDraft();
    await reload();
    setView({ page: 'compose', convId: draft.id });
  }, [reload]);

  useEffect(() => {
    (async () => {
      await openDraft();
      if (new URLSearchParams(location.search).has('check')) {
        await runSelfTest();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSelfTest() {
    const report: Record<string, boolean> = {};
    const fresh = await api.getState();
    const draft = await api.getDraft();
    report['state loaded'] = fresh.conversations.length > 0;
    report['draft has agents'] = draft.agents.length > 0;
    await new Promise((r) => setTimeout(r, 250));
    report['compose rendered'] =
      document.querySelector('.compose-page') !== null;
    // Shared prompt + at least the default agent card carry attach buttons.
    report['attach controls'] =
      document.querySelectorAll('.compose-page .attach-btn').length >= 2;
    // Every persona card lets the user pick its output modality.
    report['modality selector'] =
      document.querySelectorAll('.compose-page .modality-row select').length
        >= 1;
    // Open the persona menu so the screenshot covers its (drop-up) placement.
    const libraryBtn = document.querySelector<HTMLButtonElement>(
      '.compose-bottom .menu-anchor button');
    libraryBtn?.click();
    await new Promise((r) => setTimeout(r, 100));
    report['persona menu opens'] =
      document.querySelector('.menu.up') !== null;
    // The Six Thinking Hats library ships seeded, each row deletable.
    report['persona library seeded'] =
      document.querySelectorAll('.menu.up .menu-row').length >= 6;
    report['persona delete control'] =
      document.querySelector('.menu.up .menu-row .row-x') !== null;
    await api.checkShot('compose');
    libraryBtn?.click();
    // Fill the compose grid past one row: cards must wrap underneath
    // rather than scroll the page sideways.
    const addBtn = document.querySelector<HTMLButtonElement>(
      '.compose-bottom button');
    for (let i = 0; i < 4; i++) {
      addBtn?.click();
      await new Promise((r) => setTimeout(r, 80));
    }
    await new Promise((r) => setTimeout(r, 250));
    const grid = document.querySelector<HTMLElement>('.cards');
    const cards = document.querySelectorAll<HTMLElement>('.agent-card');
    report['persona cards wrap'] = grid !== null && cards.length >= 5
      && grid.scrollWidth <= grid.clientWidth
      && cards[cards.length - 1]!.offsetTop > cards[0]!.offsetTop;
    await api.checkShot('compose-wrapped');
    setView({ page: 'chat', convId: draft.id });
    await new Promise((r) => setTimeout(r, 250));
    report['chat rendered'] = document.querySelector('.chat-page') !== null;
    report['chat attach control'] =
      document.querySelector('.chat-page .attach-btn') !== null;
    try {
      const svg = await renderMermaidSvg('graph TD; A-->B;');
      report['mermaid renders'] = svg.includes('<svg');
    } catch {
      report['mermaid renders'] = false;
    }
    await api.checkShot('chat');
    // Expand one column to full window, then restore.
    const expandBtn = document.querySelector<HTMLButtonElement>(
      '.col-header .expand-btn');
    expandBtn?.click();
    await new Promise((r) => setTimeout(r, 150));
    report['column expands full-window'] =
      document.querySelector('.sidebar') === null
      && document.querySelectorAll('.agent-column:not(.hidden)').length === 1;
    await api.checkShot('chat-expanded');
    document.querySelector<HTMLButtonElement>(
      '.col-header .expand-btn')?.click();
    await new Promise((r) => setTimeout(r, 150));
    report['column restores'] =
      document.querySelector('.sidebar') !== null;
    // Quoting a passage across the council. Seed one exchange first: both
    // calls are plain persistence, so the self-test still reaches no model.
    const reply = 'Start with the smallest thing that could work.';
    const sent = await api.sendMessage(draft.id, 'What should we build?');
    for (const slotId of Object.values(sent.slotIds)) {
      await api.finalizeMessage(slotId, reply);
    }
    await reload();
    await new Promise((r) => setTimeout(r, 200));
    const passage = document.querySelector('.agent-column .msg-assistant');
    const selection = window.getSelection();
    if (passage && selection) {
      const range = document.createRange();
      range.selectNodeContents(passage);
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }
    await new Promise((r) => setTimeout(r, 150));
    report['quote control follows a selection'] =
      document.querySelector('.quote-pop') !== null;
    await api.checkShot('chat-quote');
    document.querySelector<HTMLButtonElement>('.quote-pop button')?.click();
    await new Promise((r) => setTimeout(r, 150));
    const prompt = document.querySelector<HTMLTextAreaElement>(
      '.input-row textarea');
    // The passage lands in the shared prompt, attributed and marked, ready
    // for one Send to put it to every agent.
    report['passage quoted into the prompt'] =
      (prompt?.value ?? '').includes(`> ${reply}`)
      && document.querySelector('.quote-pop') === null;
    await api.checkShot('chat-quoted');
    // Your own call, repeated at the head of every column, quotes as
    // yours — and its "You" label stays behind as the chrome it is.
    const ownTurn = document.querySelector('.agent-column .msg-user');
    if (ownTurn && selection) {
      const range = document.createRange();
      range.selectNodeContents(ownTurn);
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }
    await new Promise((r) => setTimeout(r, 150));
    document.querySelector<HTMLButtonElement>('.quote-pop button')?.click();
    await new Promise((r) => setTimeout(r, 150));
    // The label as the column renders it, so the check reads the same in
    // either language (runSelfTest captured `t` before the state loaded).
    const youLabel =
      document.querySelector('.agent-column .turn-label')?.textContent ?? '';
    report['your own turn quotes as yours'] = youLabel !== ''
      && (prompt?.value ?? '').includes(
        `> ${youLabel}:\n> What should we build?`);
    // Stopping a reply. This needs a live stream, so the walk feeds the
    // renderer a fake one — an endless SSE body that dies when the request
    // is aborted, exactly like a real one — behind a throwaway key (check
    // mode keeps it in memory, never in the keychain: see ipc.ts).
    {
      await api.setApiKey('check-key');
      const realFetch = globalThis.fetch;
      globalThis.fetch = ((_url: string, init: RequestInit) => {
        const signal = init.signal!;
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            signal.addEventListener('abort', () =>
              c.error(new DOMException('aborted', 'AbortError')));
          },
          async pull(c) {
            await new Promise((r) => setTimeout(r, 120));
            try {
              c.enqueue(new TextEncoder().encode(
                'data: {"choices":[{"delta":{"content":"and on it goes "}}]}'
                + '\n'));
            } catch { /* stopped: the stream is already errored */ }
          },
        });
        return Promise.resolve(new Response(body, { status: 200 }));
      }) as unknown as typeof fetch;

      const accent = document.querySelector<HTMLButtonElement>(
        '.input-row button.accent');
      const sendLabel = accent?.textContent ?? '';
      accent?.click(); // the quoted passage above is the prompt
      await new Promise((r) => setTimeout(r, 700));
      const speaking = document.querySelectorAll('.col-header .stop-btn');
      // Every voice offers its own stop, and the composer's stamped control
      // has turned into the one that stops them all.
      report['stop control while a voice speaks'] = speaking.length >= 2
        && (accent?.textContent ?? '') !== sendLabel;
      await api.checkShot('chat-streaming');
      (speaking[0] as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 400));
      report['one voice stops, the others carry on'] =
        document.querySelectorAll('.col-header .stop-btn').length
          === speaking.length - 1;
      await api.checkShot('chat-stopped-one');
      document.querySelector<HTMLButtonElement>(
        '.input-row button.accent')?.click();
      await new Promise((r) => setTimeout(r, 600));
      report['stopping all ends the run'] =
        document.querySelectorAll('.col-header .stop-btn').length === 0
        && (document.querySelector('.input-row button.accent')?.textContent
          ?? '') === sendLabel;
      // What each voice managed to say is kept, not thrown away.
      report['a stopped reply keeps what it printed'] =
        Array.from(document.querySelectorAll('.msg-assistant'))
          .some((el) => (el.textContent ?? '').includes('and on it goes'));
      globalThis.fetch = realFetch;
      await api.setApiKey('');
    }
    // Settings modal: the model list must show the seeded defaults.
    setSettingsOpen(true);
    await new Promise((r) => setTimeout(r, 250));
    report['settings model list'] =
      document.querySelectorAll('.modal .model-row').length >= 2;
    await api.checkShot('settings');
    setSettingsOpen(false);
    await api.checkReady(report);
  }

  if (!state || !view) return null;

  const conv: Conversation | undefined =
    state.conversations.find((c) => c.id === view.convId);

  return (
    <div className="app">
      {!chatExpanded && <Sidebar
        t={t}
        conversations={state.conversations}
        activeId={view.page === 'chat' ? view.convId : null}
        onNewSession={openDraft}
        onOpen={(id) => setView({ page: 'chat', convId: id })}
        onDelete={async (id) => {
          await api.deleteConversation(id);
          showToast(t('session_deleted'));
          if (view.convId === id) await openDraft();
          else await reload();
        }}
        onSettings={() => setSettingsOpen(true)}
      />}
      {conv && view.page === 'compose' && (
        <ComposePage
          t={t}
          conv={conv}
          personas={state.personas}
          models={state.settings.models}
          onChanged={reload}
          onToast={showToast}
          onStart={() => setView({ page: 'chat', convId: conv.id })}
        />
      )}
      {conv && view.page === 'chat' && (
        <ChatPage
          t={t}
          conv={conv}
          models={state.settings.models}
          onChanged={reload}
          onToast={showToast}
          onEditAgents={() => setView({ page: 'compose', convId: conv.id })}
          onExpandChange={setChatExpanded}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          t={t}
          language={state.settings.language}
          models={state.settings.models}
          onClose={() => setSettingsOpen(false)}
          onSaved={async (languageChanged) => {
            setSettingsOpen(false);
            await reload();
            if (languageChanged) showToast(t('language_updated'));
          }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
