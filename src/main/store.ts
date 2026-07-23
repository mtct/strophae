// Persistence: one JSON document in the per-user data directory, written
// atomically (tmp + rename) and debounced. The TypeScript heir of the
// retired Django ORM layer — same domain rules, including draft semantics
// (a draft = conversation with zero messages).

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { deleteAttachmentFiles, sweepAttachments } from './attachments';
import { translate, type Lang } from '../shared/i18n';
import {
  DEFAULT_AGENT, DEFAULT_MODELS, defaultModality, modelSlug, nextHue,
  titleFrom,
} from '../shared/models';
import type {
  Agent,
  Attachment,
  Conversation,
  Language,
  Message,
  Modality,
  ModelEntry,
  Persona,
  SendResult,
  Settings,
} from '../shared/types';

interface Data {
  nextId: number;
  conversations: Conversation[];
  personas: Persona[];
  settings: Settings;
}

const EMPTY: Data = {
  nextId: 1,
  conversations: [],
  personas: [],
  settings: { language: '', models: [] },
};

export class Store {
  private data: Data;
  private file: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private dir: string, private osLang: Lang) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'strophae.json');
    this.data = this.load();
    sweepAttachments(dir, this.referencedAttachmentIds());
  }

  private load(): Data {
    let data: Data;
    try {
      data = { ...EMPTY, ...JSON.parse(readFileSync(this.file, 'utf-8')) };
    } catch {
      data = structuredClone(EMPTY);
    }
    // Documents predating configurable models get the seed list.
    if (!data.settings.models?.length) {
      data.settings.models = structuredClone(DEFAULT_MODELS);
    }
    // Documents predating per-persona modality: infer it from the model
    // slug (same heuristic the old image-only path used), then freeze it.
    const models = data.settings.models;
    const backfill = (m: { model: string; modality?: Modality }) => {
      if (!m.modality) m.modality = defaultModality(modelSlug(m.model, models));
    };
    for (const conv of data.conversations) conv.agents.forEach(backfill);
    data.personas.forEach(backfill);
    return data;
  }

  private save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 150);
  }

  flush(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    renameSync(tmp, this.file);
  }

  private id(): number {
    return this.data.nextId++;
  }

  /** Reserve an id for an entity built outside the store (att:pick). */
  claimId(): number {
    const value = this.id();
    this.save();
    return value;
  }

  private now(): string {
    return new Date().toISOString();
  }

  lang(): Lang {
    return this.data.settings.language || this.osLang;
  }

  // ------------------------------------------------------------- queries

  conversations(): Conversation[] {
    return this.data.conversations;
  }

  personas(): Persona[] {
    return [...this.data.personas].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  settings(): Settings {
    return this.data.settings;
  }

  conversation(id: number): Conversation {
    const conv = this.data.conversations.find((c) => c.id === id);
    if (!conv) throw new Error(`No conversation ${id}`);
    return conv;
  }

  private agent(agentId: number): { conv: Conversation; agent: Agent } {
    for (const conv of this.data.conversations) {
      const agent = conv.agents.find((a) => a.id === agentId);
      if (agent) return { conv, agent };
    }
    throw new Error(`No agent ${agentId}`);
  }

  // ------------------------------------------------------------ sessions

  createSession(): Conversation {
    const lang = this.lang();
    const now = this.now();
    const conv: Conversation = {
      id: this.id(),
      title: translate(lang, 'new_session'),
      sharedSystemPrompt: '',
      createdAt: now,
      updatedAt: now,
      agents: [],
    };
    conv.agents.push(this.buildAgent(conv, {
      name: translate(lang, 'default_agent_name'),
      systemPrompt: translate(lang, 'default_agent_prompt'),
      hue: DEFAULT_AGENT.hue,
      model: this.defaultModel(),
      personaType: DEFAULT_AGENT.personaType,
      modality: DEFAULT_AGENT.modality,
    }));
    this.data.conversations.push(conv);
    this.save();
    return conv;
  }

  getOrCreateDraft(): Conversation {
    const drafts = this.data.conversations
      .filter((c) => c.agents.every((a) => a.messages.length === 0))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return drafts[0] ?? this.createSession();
  }

  deleteConversation(id: number): void {
    const gone = this.data.conversations.find((c) => c.id === id);
    this.data.conversations =
      this.data.conversations.filter((c) => c.id !== id);
    if (gone) this.gcAttachments(this.attachmentsIn(gone));
    this.save();
  }

  setSharedPrompt(convId: number, text: string): void {
    this.conversation(convId).sharedSystemPrompt = text;
    this.save();
  }

  // -------------------------------------------------------------- agents

  private buildAgent(conv: Conversation, fields: {
    name: string; hue: number; model: string; personaType: string;
    modality: Modality; systemPrompt: string;
  }): Agent {
    return {
      id: this.id(),
      order: conv.agents.length,
      messages: [],
      ...fields,
    };
  }

  addAgent(convId: number): Agent {
    const conv = this.conversation(convId);
    const model = this.defaultModel();
    const agent = this.buildAgent(conv, {
      name: translate(this.lang(), 'agent_n', { n: conv.agents.length + 1 }),
      hue: nextHue(conv.agents.map((a) => a.hue)),
      model,
      personaType: 'generic',
      modality: defaultModality(modelSlug(model, this.data.settings.models)),
      systemPrompt: '',
    });
    conv.agents.push(agent);
    this.save();
    return agent;
  }

  addAgentFromPersona(convId: number, personaId: number): Agent {
    const conv = this.conversation(convId);
    const persona = this.data.personas.find((p) => p.id === personaId);
    if (!persona) throw new Error(`No persona ${personaId}`);
    const agent = this.buildAgent(conv, {
      name: persona.name,
      hue: persona.hue,
      model: persona.model,
      personaType: persona.personaType,
      modality: persona.modality,
      systemPrompt: persona.systemPrompt,
    });
    conv.agents.push(agent);
    this.save();
    return agent;
  }

  updateAgent(agentId: number, fields: Partial<
      Pick<Agent, 'name' | 'hue' | 'model' | 'modality' | 'systemPrompt'>>)
      : Agent {
    const { agent } = this.agent(agentId);
    Object.assign(agent, fields);
    this.save();
    return agent;
  }

  removeAgent(agentId: number): void {
    const { conv, agent } = this.agent(agentId);
    if (conv.agents.length <= 1) throw new Error('need_one_agent');
    conv.agents = conv.agents.filter((a) => a.id !== agentId);
    this.gcAttachments(this.attachmentsInAgent(agent));
    this.save();
  }

  clearThread(agentId: number): void {
    const { agent } = this.agent(agentId);
    const orphans = agent.messages.flatMap((m) => m.attachments ?? []);
    agent.messages = [];
    this.gcAttachments(orphans);
    this.save();
  }

  savePersona(agentId: number): Persona {
    const { agent } = this.agent(agentId);
    const persona: Persona = {
      id: this.id(),
      name: agent.name,
      hue: agent.hue,
      model: agent.model,
      personaType: agent.personaType,
      modality: agent.modality,
      systemPrompt: agent.systemPrompt,
      createdAt: this.now(),
    };
    this.data.personas.push(persona);
    this.save();
    return persona;
  }

  // --------------------------------------------------------- attachments

  attachToConversation(convId: number, atts: Attachment[]): Conversation {
    const conv = this.conversation(convId);
    (conv.attachments ??= []).push(...atts);
    this.save();
    return conv;
  }

  detachFromConversation(convId: number, attId: number): Conversation {
    const conv = this.conversation(convId);
    const gone = (conv.attachments ?? []).filter((a) => a.id === attId);
    conv.attachments = (conv.attachments ?? []).filter((a) => a.id !== attId);
    this.gcAttachments(gone);
    this.save();
    return conv;
  }

  attachToAgent(agentId: number, atts: Attachment[]): Agent {
    const { agent } = this.agent(agentId);
    (agent.attachments ??= []).push(...atts);
    this.save();
    return agent;
  }

  detachFromAgent(agentId: number, attId: number): Agent {
    const { agent } = this.agent(agentId);
    const gone = (agent.attachments ?? []).filter((a) => a.id === attId);
    agent.attachments = (agent.attachments ?? []).filter(
      (a) => a.id !== attId);
    this.gcAttachments(gone);
    this.save();
    return agent;
  }

  private attachmentsInAgent(agent: Agent): Attachment[] {
    return [
      ...(agent.attachments ?? []),
      ...agent.messages.flatMap((m) => m.attachments ?? []),
    ];
  }

  private attachmentsIn(conv: Conversation): Attachment[] {
    return [
      ...(conv.attachments ?? []),
      ...conv.agents.flatMap((a) => this.attachmentsInAgent(a)),
    ];
  }

  private referencedAttachmentIds(): Set<number> {
    return new Set(this.data.conversations
      .flatMap((c) => this.attachmentsIn(c)).map((a) => a.id));
  }

  /** Delete the payload files of `candidates` no longer referenced
      anywhere (one send() shares its attachments across every agent). */
  private gcAttachments(candidates: Attachment[]): void {
    const kept = this.referencedAttachmentIds();
    deleteAttachmentFiles(
      this.dir, candidates.filter((a) => !kept.has(a.id)));
  }

  // ------------------------------------------------------------ messages

  /** Persist the user message + an empty assistant slot per agent. */
  send(convId: number, text: string,
       attachments: Attachment[] = []): SendResult {
    const conv = this.conversation(convId);
    const isFirst = conv.agents.every((a) => a.messages.length === 0);
    if (isFirst) {
      conv.title = titleFrom(text) || attachments[0]?.name || conv.title;
    }
    const slotIds: Record<number, number> = {};
    for (const agent of conv.agents) {
      agent.messages.push({
        id: this.id(), role: 'user', text, createdAt: this.now(),
        ...(attachments.length ? { attachments: [...attachments] } : {}),
      });
      const slot: Message =
        { id: this.id(), role: 'assistant', text: '', createdAt: this.now() };
      agent.messages.push(slot);
      slotIds[agent.id] = slot.id;
    }
    conv.updatedAt = this.now();
    this.save();
    return { conversation: conv, slotIds };
  }

  finalizeMessage(messageId: number, text: string,
                  attachments: Attachment[] = []): void {
    for (const conv of this.data.conversations) {
      for (const agent of conv.agents) {
        const msg = agent.messages.find((m) => m.id === messageId);
        if (msg) {
          msg.text = text;
          if (attachments.length) {
            msg.attachments = [...(msg.attachments ?? []), ...attachments];
          }
          conv.updatedAt = this.now();
          this.save();
          return;
        }
      }
    }
    throw new Error(`No message ${messageId}`);
  }

  // ------------------------------------------------------------ settings

  setLanguage(language: Language): void {
    this.data.settings.language = language;
    this.save();
  }

  /** The stock default when the user still lists it, else their first. */
  private defaultModel(): string {
    const models = this.data.settings.models;
    return models.some((m) => m.label === DEFAULT_AGENT.model)
      ? DEFAULT_AGENT.model
      : models[0]!.label;
  }

  /** Replace the selectable-model list (Settings modal Save). */
  setModels(models: ModelEntry[]): Settings {
    const seen = new Set<string>();
    const clean: ModelEntry[] = [];
    for (const m of models) {
      const label = m.label.trim();
      const slug = m.slug.trim();
      if (!label || !slug || seen.has(label)) continue;
      seen.add(label);
      clean.push({ label, slug });
    }
    if (clean.length === 0) throw new Error('need_one_model');
    this.data.settings.models = clean;
    this.save();
    return this.data.settings;
  }
}
