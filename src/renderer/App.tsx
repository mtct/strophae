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
    // Open the persona menu so the screenshot covers its (drop-up) placement.
    const libraryBtn = document.querySelector<HTMLButtonElement>(
      '.compose-bottom .menu-anchor button');
    libraryBtn?.click();
    await new Promise((r) => setTimeout(r, 100));
    report['persona menu opens'] =
      document.querySelector('.menu.up') !== null;
    await api.checkShot('compose');
    libraryBtn?.click();
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
