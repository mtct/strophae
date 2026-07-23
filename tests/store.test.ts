import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync }
  from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { attachmentsDir } from '../src/main/attachments';
import { Store } from '../src/main/store';
import type { Attachment } from '../src/shared/types';

let dir: string;
let store: Store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'strophae-'));
  store = new Store(dir, 'en');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('sessions', () => {
  test('a new session seeds one neutral agent', () => {
    const conv = store.createSession();
    expect(conv.agents).toHaveLength(1);
    expect(conv.agents[0]!.name).toBe('Simple Jack');
    expect(conv.agents[0]!.systemPrompt).toContain('neutral assistant');
  });

  test('the draft is reused until it has messages', () => {
    const draft = store.getOrCreateDraft();
    expect(store.getOrCreateDraft().id).toBe(draft.id);
    store.send(draft.id, 'hello');
    expect(store.getOrCreateDraft().id).not.toBe(draft.id);
  });

  test('localized defaults are materialised in the store language', () => {
    const itStore = new Store(mkdtempSync(join(tmpdir(), 'strophae-')), 'it');
    const conv = itStore.createSession();
    expect(conv.title).toBe('Nuova sessione');
    expect(conv.agents[0]!.systemPrompt).toContain('assistente');
  });
});

describe('send', () => {
  test('persists the user message and an empty slot per agent', () => {
    const conv = store.createSession();
    store.addAgent(conv.id);
    const result = store.send(conv.id, 'ping');
    expect(Object.keys(result.slotIds)).toHaveLength(2);
    for (const agent of result.conversation.agents) {
      expect(agent.messages).toHaveLength(2);
      expect(agent.messages[0]!).toMatchObject({ role: 'user', text: 'ping' });
      expect(agent.messages[1]!).toMatchObject({ role: 'assistant', text: '' });
    }
  });

  test('titles the conversation from the first prompt, truncated', () => {
    const conv = store.createSession();
    const long = 'x'.repeat(60);
    const result = store.send(conv.id, long);
    expect(result.conversation.title.length).toBeLessThanOrEqual(47);
    expect(result.conversation.title.endsWith('…')).toBe(true);
  });

  test('finalize writes the streamed text into the slot', () => {
    const conv = store.createSession();
    const { slotIds, conversation } = store.send(conv.id, 'q');
    const slotId = slotIds[conversation.agents[0]!.id]!;
    store.finalizeMessage(slotId, 'answer');
    const msg = store.conversation(conv.id).agents[0]!.messages
      .find((m) => m.id === slotId);
    expect(msg!.text).toBe('answer');
  });
});

describe('agents & personas', () => {
  test('added agents get distinct palette hues and localized names', () => {
    const conv = store.createSession();
    const agent = store.addAgent(conv.id);
    expect(agent.name).toBe('Agent 2');
    expect(agent.hue).not.toBe(conv.agents[0]!.hue);
  });

  test('the last agent cannot be removed', () => {
    const conv = store.createSession();
    expect(() => store.removeAgent(conv.agents[0]!.id)).toThrow();
  });

  test('save persona then add it to a session', () => {
    const conv = store.createSession();
    store.updateAgent(conv.agents[0]!.id, { name: 'Muse', hue: 310 });
    const persona = store.savePersona(conv.agents[0]!.id);
    const agent = store.addAgentFromPersona(conv.id, persona.id);
    expect(agent.name).toBe('Muse');
    expect(agent.hue).toBe(310);
  });

  test('new agents default to the text modality', () => {
    const conv = store.createSession();
    expect(conv.agents[0]!.modality).toBe('text');
    expect(store.addAgent(conv.id).modality).toBe('text');
  });

  test('modality is user-editable and carried onto a saved persona', () => {
    const conv = store.createSession();
    const agent = store.updateAgent(
      conv.agents[0]!.id, { modality: 'audio' });
    expect(agent.modality).toBe('audio');
    const persona = store.savePersona(agent.id);
    expect(persona.modality).toBe('audio');
    expect(store.addAgentFromPersona(conv.id, persona.id).modality)
      .toBe('audio');
  });

  test('legacy documents backfill modality from the model slug', () => {
    const legacy = mkdtempSync(join(tmpdir(), 'strophae-'));
    writeFileSync(join(legacy, 'strophae.json'), JSON.stringify({
      nextId: 50,
      conversations: [{
        id: 1, title: 't', sharedSystemPrompt: '', createdAt: '', updatedAt: '',
        agents: [{
          id: 2, name: 'Pix', hue: 255, model: 'Gemini 2.5 Flash Image',
          personaType: 'generic', systemPrompt: '', order: 0, messages: [],
        }],
      }],
      personas: [{
        id: 3, name: 'Voice', hue: 60, model: 'openai/gpt-4o-audio-preview',
        personaType: 'generic', systemPrompt: '', createdAt: '',
      }],
      settings: { language: '', models: [] },
    }));
    const migrated = new Store(legacy, 'en');
    expect(migrated.conversation(1).agents[0]!.modality).toBe('image');
    expect(migrated.personas()[0]!.modality).toBe('audio');
    rmSync(legacy, { recursive: true, force: true });
  });
});

describe('attachments', () => {
  const fakeAtt = (id: number): Attachment =>
    ({ id, name: `file-${id}.txt`, mime: 'text/plain', kind: 'text', size: 3 });
  const payloadPath = (id: number) => join(attachmentsDir(dir), `${id}.txt`);
  const seed = (att: Attachment) => {
    mkdirSync(attachmentsDir(dir), { recursive: true });
    writeFileSync(payloadPath(att.id), 'abc');
  };

  test('attach/detach on the conversation deletes the payload file', () => {
    const conv = store.createSession();
    const att = fakeAtt(store.claimId());
    seed(att);
    store.attachToConversation(conv.id, [att]);
    expect(store.conversation(conv.id).attachments).toHaveLength(1);
    store.detachFromConversation(conv.id, att.id);
    expect(store.conversation(conv.id).attachments).toHaveLength(0);
    expect(existsSync(payloadPath(att.id))).toBe(false);
  });

  test('agent attachments follow the agent', () => {
    const conv = store.createSession();
    const agent = conv.agents[0]!;
    const att = fakeAtt(store.claimId());
    seed(att);
    store.attachToAgent(agent.id, [att]);
    expect(store.conversation(conv.id).agents[0]!.attachments)
      .toHaveLength(1);
    store.detachFromAgent(agent.id, att.id);
    expect(existsSync(payloadPath(att.id))).toBe(false);
  });

  test('a sent file shared across agents survives one thread clear', () => {
    const conv = store.createSession();
    store.addAgent(conv.id);
    const att = fakeAtt(store.claimId());
    seed(att);
    store.send(conv.id, 'look at this', [att]);
    const [a, b] = store.conversation(conv.id).agents;
    expect(a!.messages[0]!.attachments).toHaveLength(1);
    expect(b!.messages[0]!.attachments).toHaveLength(1);
    store.clearThread(a!.id);
    expect(existsSync(payloadPath(att.id))).toBe(true); // b still refers
    store.clearThread(b!.id);
    expect(existsSync(payloadPath(att.id))).toBe(false);
  });

  test('deleting a conversation garbage-collects its files', () => {
    const conv = store.createSession();
    const att = fakeAtt(store.claimId());
    seed(att);
    store.send(conv.id, 'hello', [att]);
    store.deleteConversation(conv.id);
    expect(existsSync(payloadPath(att.id))).toBe(false);
  });

  test('an attachment-only send titles the session from the file', () => {
    const conv = store.createSession();
    const att = fakeAtt(store.claimId());
    seed(att);
    const result = store.send(conv.id, '', [att]);
    expect(result.conversation.title).toBe(att.name);
  });

  test('startup sweep drops orphan payload files', () => {
    const conv = store.createSession();
    const kept = fakeAtt(store.claimId());
    seed(kept);
    store.attachToConversation(conv.id, [kept]);
    const orphan = fakeAtt(store.claimId());
    seed(orphan);
    store.flush();
    new Store(dir, 'en');
    expect(existsSync(payloadPath(kept.id))).toBe(true);
    expect(existsSync(payloadPath(orphan.id))).toBe(false);
  });
});

describe('model settings', () => {
  test('a fresh store seeds the default model list', () => {
    const models = store.settings().models;
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((m) => m.label === 'DeepSeek 4 Flash')).toBe(true);
  });

  test('setModels trims, dedupes and persists', () => {
    store.setModels([
      { label: '  Kimi K2  ', slug: ' moonshotai/kimi-k2 ' },
      { label: 'Kimi K2', slug: 'other/slug' },
      { label: '', slug: 'x/y' },
    ]);
    store.flush();
    const models = new Store(dir, 'en').settings().models;
    expect(models).toEqual(
      [{ label: 'Kimi K2', slug: 'moonshotai/kimi-k2' }]);
  });

  test('an empty list is rejected', () => {
    expect(() => store.setModels([{ label: ' ', slug: '' }])).toThrow();
  });

  test('new agents fall back to the first model when the stock default '
      + 'was removed', () => {
    store.setModels([{ label: 'Only One', slug: 'a/b' }]);
    const conv = store.createSession();
    expect(conv.agents[0]!.model).toBe('Only One');
    expect(store.addAgent(conv.id).model).toBe('Only One');
  });
});

describe('persistence', () => {
  test('data survives a reload from disk', () => {
    const conv = store.createSession();
    store.send(conv.id, 'persist me');
    store.flush();
    const reloaded = new Store(dir, 'en');
    expect(reloaded.conversations()).toHaveLength(1);
    expect(reloaded.conversations()[0]!.title).toBe('persist me');
  });
});
