import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { attachmentsDir } from '../src/main/attachments';
import { Store } from '../src/main/store';
import type { Lang } from '../src/shared/i18n';
import { modelSlug } from '../src/shared/models';
import type { Attachment } from '../src/shared/types';

let dir: string;
let store: Store;

// A Store writes through a 150 ms debounce, so one is still owed a write
// for a while after the last mutation — that is what `flush()` on quit is
// for in the app. Tests need the same shutdown: pulling a store's directory
// out from under a pending timer makes it throw ENOENT from inside
// setTimeout, failing the run wherever the timer wins the race. Every store
// built here is tracked, flushed at teardown, and only then has its
// directory removed.
const open: { dir: string; store: Store }[] = [];

function openStore(lang: Lang = 'en', at?: string): Store {
  const path = at ?? mkdtempSync(join(tmpdir(), 'strophae-'));
  const opened = new Store(path, lang);
  open.push({ dir: path, store: opened });
  return opened;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'strophae-'));
  store = openStore('en', dir);
});

afterEach(() => {
  const used = open.splice(0);
  // Flush every store before removing any directory: stores sharing a
  // directory (a document reopened mid-test) must all settle first.
  for (const { store: s } of used) s.flush();
  for (const { dir: d } of used) rmSync(d, { recursive: true, force: true });
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
    const itStore = openStore('it');
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

  test('a fresh store seeds the six thinking hats in hat order', () => {
    const names = store.personas().map((p) => p.name);
    expect(names.slice(0, 6)).toEqual([
      'White Hat — Facts',
      'Red Hat — Feelings',
      'Black Hat — Caution',
      'Yellow Hat — Benefits',
      'Green Hat — Creativity',
      'Blue Hat — Process',
    ]);
    const white = store.personas()[0]!;
    expect(white.personaType).toBe('white_hat');
    expect(white.modality).toBe('text');
    expect(white.systemPrompt).toContain('facts');
    // Distinct accents, so the personas are told apart in the library.
    expect(new Set(store.personas().map((p) => p.hue)).size).toBe(8);
  });

  test('a fresh store seeds Raffaello (image) and Iggy (audio)', () => {
    const raffaello =
      store.personas().find((p) => p.personaType === 'raffaello')!;
    expect(raffaello.name).toBe('Raffaello');
    expect(raffaello.modality).toBe('image');
    expect(raffaello.model).toBe('Gemini 2.5 Flash Image');
    const iggy = store.personas().find((p) => p.personaType === 'iggy')!;
    expect(iggy.name).toBe('Iggy');
    expect(iggy.modality).toBe('audio');
    expect(iggy.model).toBe('GPT Audio mini');
    // Added to a session, a media persona carries its modality and model
    // onto the agent, so it renders images/audio without further setup.
    const conv = store.createSession();
    const agent = store.addAgentFromPersona(conv.id, raffaello.id);
    expect(agent.modality).toBe('image');
    expect(agent.model).toBe('Gemini 2.5 Flash Image');
  });

  test('the seeded hats are materialised in the store language', () => {
    const itStore = openStore('it');
    expect(itStore.personas()[0]!.name).toBe('Cappello Bianco — Fatti');
  });

  test('switching language re-translates the pristine seed personas', () => {
    const white = () =>
      store.personas().find((p) => p.personaType === 'white_hat')!;
    const iggy = () =>
      store.personas().find((p) => p.personaType === 'iggy')!;
    expect(white().name).toBe('White Hat — Facts');
    const enWhitePrompt = white().systemPrompt;
    const enIggyPrompt = iggy().systemPrompt;

    store.setLanguage('it');

    expect(white().name).toBe('Cappello Bianco — Fatti');
    expect(white().systemPrompt).not.toBe(enWhitePrompt);
    // Media personas follow too: the proper-noun name stays, prompt translates.
    expect(iggy().name).toBe('Iggy');
    expect(iggy().systemPrompt).not.toBe(enIggyPrompt);
  });

  test('re-translation survives a reload and flips back on switch-back', () => {
    store.setLanguage('it');
    store.flush();
    const reopened = openStore('en', dir); // osLang ignored: setting wins
    expect(reopened.personas()[0]!.name).toBe('Cappello Bianco — Fatti');
    reopened.setLanguage('en');
    expect(reopened.personas()[0]!.name).toBe('White Hat — Facts');
  });

  test('a persona the user renamed is left untranslated', () => {
    const conv = store.createSession();
    const hat = store.personas().find((p) => p.personaType === 'white_hat')!;
    const agent = store.addAgentFromPersona(conv.id, hat.id);
    store.updateAgent(agent.id, { name: 'My Analyst' });
    const custom = store.savePersona(agent.id); // personaType white_hat, renamed

    store.setLanguage('it');

    // The seeded original is translated; the user's renamed copy is not.
    expect(store.personas().find((p) => p.id === hat.id)!.name)
      .toBe('Cappello Bianco — Fatti');
    expect(store.personas().find((p) => p.id === custom.id)!.name)
      .toBe('My Analyst');
  });

  test('a seeded hat can be added to a session like any persona', () => {
    const conv = store.createSession();
    const black = store.personas().find((p) => p.personaType === 'black_hat')!;
    const agent = store.addAgentFromPersona(conv.id, black.id);
    expect(agent.name).toBe('Black Hat — Caution');
    expect(agent.hue).toBe(black.hue);
    expect(agent.systemPrompt).toBe(black.systemPrompt);
  });

  test('deleting a persona removes it and never re-seeds it', () => {
    const before = store.personas().length;
    const doomed = store.personas()[0]!;
    store.deletePersona(doomed.id);
    expect(store.personas()).toHaveLength(before - 1);
    expect(store.personas().some((p) => p.id === doomed.id)).toBe(false);
    store.flush();
    // A later run must not resurrect the deleted library entry.
    expect(openStore('en', dir).personas()).toHaveLength(before - 1);
  });

  test('deleting a persona leaves agents built from it untouched', () => {
    const conv = store.createSession();
    const hat = store.personas()[0]!;
    const agent = store.addAgentFromPersona(conv.id, hat.id);
    store.deletePersona(hat.id);
    const kept = store.conversation(conv.id).agents
      .find((a) => a.id === agent.id)!;
    expect(kept.name).toBe(hat.name);
    expect(kept.systemPrompt).toBe(hat.systemPrompt);
  });

  test('documents on the retired audio model follow the seed to its heir',
    () => {
      const stale = mkdtempSync(join(tmpdir(), 'strophae-'));
      writeFileSync(join(stale, 'strophae.json'), JSON.stringify({
        nextId: 50,
        conversations: [{
          id: 1, title: 't', sharedSystemPrompt: '', createdAt: '',
          updatedAt: '',
          agents: [{
            id: 2, name: 'Iggy', hue: 60, model: 'GPT-4o Audio',
            personaType: 'iggy', modality: 'audio', systemPrompt: '',
            order: 0, messages: [],
          }],
        }],
        personas: [
          {
            id: 3, name: 'Iggy', hue: 60, model: 'GPT-4o Audio',
            personaType: 'iggy', modality: 'audio', systemPrompt: '',
            createdAt: '',
          },
          // Edited by the user: same model, own name — relabelled too, so
          // it keeps pointing at a model that exists.
          {
            id: 4, name: 'Narratore', hue: 30, model: 'GPT-4o Audio',
            personaType: 'generic', modality: 'audio', systemPrompt: '',
            createdAt: '',
          },
        ],
        personasSeeded: true,
        mediaPersonasSeeded: true,
        settings: {
          language: '',
          models: [
            { label: 'GPT-4o', slug: 'openai/gpt-4o' },
            { label: 'GPT-4o Audio', slug: 'openai/gpt-4o-audio-preview' },
          ],
        },
      }));
      const migrated = openStore('en', stale);
      expect(migrated.settings().models).toContainEqual(
        { label: 'GPT Audio mini', slug: 'openai/gpt-audio-mini' });
      expect(migrated.settings().models.map((m) => m.label))
        .not.toContain('GPT-4o Audio');
      expect(migrated.conversation(1).agents[0]!.model).toBe('GPT Audio mini');
      for (const p of migrated.personas()) {
        if (p.id === 3 || p.id === 4) expect(p.model).toBe('GPT Audio mini');
      }
      // The repointing is written through, not just held in memory.
      migrated.flush();
      const onDisk = readFileSync(join(stale, 'strophae.json'), 'utf-8');
      expect(onDisk).not.toContain('gpt-4o-audio-preview');
    });

  test('a trimmed list still repoints the agents naming the retired model',
    () => {
      const trimmed = mkdtempSync(join(tmpdir(), 'strophae-'));
      writeFileSync(join(trimmed, 'strophae.json'), JSON.stringify({
        nextId: 10,
        conversations: [],
        personas: [{
          id: 1, name: 'Iggy', hue: 60, model: 'GPT-4o Audio',
          personaType: 'iggy', modality: 'audio', systemPrompt: '',
          createdAt: '',
        }],
        personasSeeded: true,
        mediaPersonasSeeded: true,
        // The user kept one model: Iggy's label resolves through neither
        // this list nor (once retired) the seed defaults.
        settings: {
          language: '',
          models: [{ label: 'DeepSeek 4 Flash', slug: 'deepseek/deepseek-v4-flash' }],
        },
      }));
      const migrated = openStore('en', trimmed);
      expect(migrated.personas()[0]!.model).toBe('GPT Audio mini');
      // The curated list is the user's: repointing does not grow it.
      expect(migrated.settings().models).toEqual(
        [{ label: 'DeepSeek 4 Flash', slug: 'deepseek/deepseek-v4-flash' }]);
      // …and the heir resolves anyway, through the seed defaults.
      expect(modelSlug(migrated.personas()[0]!.model,
        migrated.settings().models)).toBe('openai/gpt-audio-mini');
    });

  test('a model list the user edited off the seed is left alone', () => {
    const own = mkdtempSync(join(tmpdir(), 'strophae-'));
    writeFileSync(join(own, 'strophae.json'), JSON.stringify({
      nextId: 10,
      conversations: [],
      personas: [],
      personasSeeded: true,
      mediaPersonasSeeded: true,
      settings: {
        language: '',
        // Same label, a slug the user chose: not the retired seed entry.
        models: [{ label: 'GPT-4o Audio', slug: 'openai/gpt-audio' }],
      },
    }));
    const kept = openStore('en', own);
    expect(kept.settings().models).toEqual(
      [{ label: 'GPT-4o Audio', slug: 'openai/gpt-audio' }]);
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
    const migrated = openStore('en', legacy);
    expect(migrated.conversation(1).agents[0]!.modality).toBe('image');
    expect(migrated.personas().find((p) => p.id === 3)!.modality).toBe('audio');
  });

  test('documents seeded before the media personas gain them once', () => {
    const older = mkdtempSync(join(tmpdir(), 'strophae-'));
    // A document from before Raffaello/Iggy existed: hats already seeded,
    // no mediaPersonasSeeded flag.
    writeFileSync(join(older, 'strophae.json'), JSON.stringify({
      nextId: 20,
      conversations: [],
      personas: [{
        id: 1, name: 'White Hat — Facts', hue: 200, model: 'DeepSeek 4 Flash',
        personaType: 'white_hat', modality: 'text', systemPrompt: 'facts',
        createdAt: '',
      }],
      settings: { language: 'en', models: [] },
      personasSeeded: true,
    }));
    const store2 = openStore('en', older);
    const raffaello =
      store2.personas().find((p) => p.personaType === 'raffaello');
    const iggy = store2.personas().find((p) => p.personaType === 'iggy');
    expect(raffaello!.modality).toBe('image');
    expect(iggy!.modality).toBe('audio');
    // The hats are not re-seeded — the existing one is left as is.
    expect(store2.personas().filter((p) => p.personaType.endsWith('_hat')))
      .toHaveLength(1);
    store2.flush();
    // Deleting a media persona must not resurrect it on the next run, and
    // the group must not be seeded twice.
    store2.deletePersona(iggy!.id);
    store2.flush();
    const reopened = openStore('en', older);
    expect(reopened.personas().some((p) => p.personaType === 'iggy'))
      .toBe(false);
    expect(reopened.personas().filter((p) => p.personaType === 'raffaello'))
      .toHaveLength(1);
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
    openStore('en', dir);
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
    const models = openStore('en', dir).settings().models;
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
    const reloaded = openStore('en', dir);
    expect(reloaded.conversations()).toHaveLength(1);
    expect(reloaded.conversations()[0]!.title).toBe('persist me');
  });
});
