import { useEffect, useRef, useState } from 'react';

import { HUE_PALETTE } from '../../shared/models';
import type {
  Agent, Conversation, ModelEntry, Persona,
} from '../../shared/types';
import { api } from '../api';
import type { T } from '../App';
import { accent } from '../theme';
import { AttachButton, AttachmentChips } from './Attachments';

function AgentCard(props: {
  t: T;
  agent: Agent;
  models: ModelEntry[];
  onChanged: () => void;
  onToast: (msg: string) => void;
}) {
  const { t, agent } = props;
  const [name, setName] = useState(agent.name);
  const [prompt, setPrompt] = useState(agent.systemPrompt);
  const promptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setName(agent.name), [agent.id, agent.name]);
  useEffect(() => setPrompt(agent.systemPrompt), [agent.id]);

  const saveName = async () => {
    const value = name.trim();
    if (value && value !== agent.name) {
      await api.updateAgent(agent.id, { name: value });
      props.onChanged();
    }
  };

  const savePrompt = (value: string) => {
    setPrompt(value);
    if (promptTimer.current) clearTimeout(promptTimer.current);
    promptTimer.current = setTimeout(async () => {
      await api.updateAgent(agent.id, { systemPrompt: value });
    }, 400);
  };

  const cycleColor = async () => {
    const idx = HUE_PALETTE.indexOf(agent.hue);
    const hue = HUE_PALETTE[(idx + 1) % HUE_PALETTE.length]!;
    await api.updateAgent(agent.id, { hue });
    props.onChanged();
  };

  return (
    <div className="agent-card">
      <div className="bar" style={{ background: accent(agent.hue) }} />
      <div className="body">
        <div className="row">
          <input
            type="text"
            value={name}
            placeholder={t('agent_name_placeholder')}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
          />
          <button
            title={t('cycle_colour')}
            style={{ color: accent(agent.hue), width: 34 }}
            onClick={cycleColor}
          >
            ●
          </button>
        </div>
        <select
          value={agent.model}
          onChange={async (e) => {
            await api.updateAgent(agent.id, { model: e.target.value });
            props.onChanged();
          }}
        >
          {/* Keep a stale label selectable after its model was removed. */}
          {!props.models.some((m) => m.label === agent.model) && (
            <option key={agent.model}>{agent.model}</option>
          )}
          {props.models.map((m) => <option key={m.label}>{m.label}</option>)}
        </select>
        <textarea
          value={prompt}
          placeholder={t('system_prompt_placeholder')}
          onChange={(e) => savePrompt(e.target.value)}
        />
        <div className="attach-row">
          <AttachmentChips
            t={t}
            attachments={agent.attachments ?? []}
            onRemove={async (att) => {
              await api.detachFromAgent(agent.id, att.id);
              props.onChanged();
            }}
          />
          <AttachButton
            t={t}
            onPicked={async (atts) => {
              await api.attachToAgent(agent.id, atts);
              props.onChanged();
            }}
            onToast={props.onToast}
          />
        </div>
        <div className="card-actions">
          <button className="ghost" onClick={async () => {
            await api.savePersona(agent.id);
            props.onToast(t('saved'));
            props.onChanged();
          }}>
            {t('save_persona')}
          </button>
          <button className="ghost" onClick={async () => {
            try {
              await api.removeAgent(agent.id);
              props.onChanged();
            } catch {
              props.onToast(t('need_one_agent'));
            }
          }}>
            {t('remove')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ComposePage(props: {
  t: T;
  conv: Conversation;
  personas: Persona[];
  models: ModelEntry[];
  onChanged: () => void;
  onToast: (msg: string) => void;
  onStart: () => void;
}) {
  const { t, conv } = props;
  const [shared, setShared] = useState(conv.sharedSystemPrompt);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const sharedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setShared(conv.sharedSystemPrompt), [conv.id]);

  const saveShared = (value: string) => {
    setShared(value);
    if (sharedTimer.current) clearTimeout(sharedTimer.current);
    sharedTimer.current = setTimeout(async () => {
      await api.setSharedPrompt(conv.id, value);
    }, 400);
  };

  return (
    <main className="page compose-page">
      <h1 className="page-title">{t('compose_title')}</h1>
      <div className="section-label">{t('shared_label')}</div>
      <textarea
        className="shared-input"
        value={shared}
        placeholder={t('shared_placeholder')}
        onChange={(e) => saveShared(e.target.value)}
      />
      <div className="attach-row">
        <AttachmentChips
          t={t}
          attachments={conv.attachments ?? []}
          onRemove={async (att) => {
            await api.detachFromConversation(conv.id, att.id);
            props.onChanged();
          }}
        />
        <AttachButton
          t={t}
          onPicked={async (atts) => {
            await api.attachToConversation(conv.id, atts);
            props.onChanged();
          }}
          onToast={props.onToast}
        />
      </div>
      <div className="cards">
        {conv.agents.map((agent) => (
          <AgentCard
            key={agent.id}
            t={t}
            agent={agent}
            models={props.models}
            onChanged={props.onChanged}
            onToast={props.onToast}
          />
        ))}
      </div>
      <div className="compose-bottom">
        <button onClick={async () => {
          await api.addAgent(conv.id);
          props.onChanged();
        }}>
          +  {t('add_agent')}
        </button>
        <div className="menu-anchor">
          <button onClick={() => setLibraryOpen(!libraryOpen)}>
            {t('from_persona')}
          </button>
          {libraryOpen && (
            <div className="menu up" onMouseLeave={() => setLibraryOpen(false)}>
              {props.personas.length === 0 && (
                <button className="disabled">{t('no_personas_yet')}</button>
              )}
              {props.personas.map((p) => (
                <button key={p.id} onClick={async () => {
                  setLibraryOpen(false);
                  await api.addAgentFromPersona(conv.id, p.id);
                  props.onChanged();
                }}>
                  {p.name} · {p.model}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <button className="accent" onClick={props.onStart}>
          {t('start_chatting')}  →
        </button>
      </div>
    </main>
  );
}
