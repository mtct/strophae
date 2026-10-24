import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  exchange, McpSession, PROTOCOL_VERSIONS, serveMcp, type McpTool,
} from '../src/main/mcp';
import { councilTools } from '../src/main/mcp-tools';
import { Store } from '../src/main/store';
import type { Lang } from '../src/shared/i18n';
import type { McpChange } from '../src/shared/types';

const INFO = {
  name: 'strophae', title: 'Strophae', version: '0.0.0', instructions: 'hi',
};

let dir: string;
let store: Store;
let changes: McpChange[];
let tools: McpTool[];

// Like store.test.ts: flush before the directory goes, or a pending
// debounced write throws ENOENT from inside a timer.
function open(lang: Lang = 'en') {
  dir = mkdtempSync(join(tmpdir(), 'strophae-mcp-'));
  store = new Store(dir, lang);
  changes = [];
  tools = councilTools(store, (c) => changes.push(c));
}

beforeEach(() => open());

afterEach(() => {
  store.flush();
  rmSync(dir, { recursive: true, force: true });
});

interface ToolResult {
  content: { type: string; text: string }[];
  isError?: boolean;
}

/** Call a tool the way a client does, through a session. */
function call(name: string, args: Record<string, unknown> = {}): ToolResult {
  const session = new McpSession(INFO, tools);
  const reply = session.handle({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name, arguments: args },
  }) as { result: ToolResult };
  return reply.result;
}

/** A tool's JSON answer; fails the test when the tool refused. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ok(name: string, args: Record<string, unknown> = {}): any {
  const result = call(name, args);
  if (result.isError) throw new Error(result.content[0]!.text);
  return JSON.parse(result.content[0]!.text);
}

/** A tool's refusal, as the model reads it. */
function refusal(name: string, args: Record<string, unknown> = {}): string {
  const result = call(name, args);
  expect(result.isError).toBe(true);
  return result.content[0]!.text;
}

describe('protocol', () => {
  const session = () => new McpSession(INFO, tools);

  test('initialize echoes a known revision and offers the newest otherwise', () => {
    const known = session().handle({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26' },
    }) as { result: Record<string, unknown> };
    expect(known.result.protocolVersion).toBe('2025-03-26');
    expect(known.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(known.result.serverInfo).toEqual(
      { name: 'strophae', title: 'Strophae', version: '0.0.0' });
    expect(known.result.instructions).toBe('hi');

    const future = session().handle({
      jsonrpc: '2.0', id: 2, method: 'initialize',
      params: { protocolVersion: '2099-01-01' },
    }) as { result: Record<string, unknown> };
    expect(future.result.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
  });

  test('notifications and stray responses get no reply', () => {
    expect(session().handle(
      { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    expect(session().handle({ jsonrpc: '2.0', id: 9, result: {} })).toBeNull();
  });

  test('ping, unknown methods and malformed messages', () => {
    expect(session().handle({ jsonrpc: '2.0', id: 1, method: 'ping' }))
      .toEqual({ jsonrpc: '2.0', id: 1, result: {} });
    expect(session().handle({ jsonrpc: '2.0', id: 'a', method: 'nope' }))
      .toMatchObject({ id: 'a', error: { code: -32601 } });
    expect(session().handle({ id: 1, method: 'ping' }))
      .toMatchObject({ error: { code: -32600 } });
    expect(session().handle(42)).toMatchObject({ error: { code: -32600 } });
  });

  test('tools/list describes every tool, without its code', () => {
    const reply = session().handle(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' }) as
      { result: { tools: Record<string, unknown>[] } };
    const listed = reply.result.tools;
    expect(listed.map((t) => t.name)).toEqual([
      'list_personas', 'list_models', 'create_persona', 'update_persona',
      'get_council', 'compose_council', 'set_shared_prompt', 'add_member',
      'update_member', 'remove_member',
    ]);
    for (const tool of listed) {
      expect(tool.run).toBeUndefined();
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
      expect(typeof tool.description).toBe('string');
    }
  });

  test('an unknown tool is a protocol error, a refused call is a result', () => {
    expect(session().handle({
      jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nope' },
    })).toMatchObject({ error: { code: -32602 } });
    expect(refusal('add_member', {})).toContain('"persona"');
  });

  test('a batch is answered as one', () => {
    const replies = session().handle([
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'ping' },
    ]) as { id: number }[];
    expect(replies.map((r) => r.id)).toEqual([1, 2]);
  });
});

describe('library', () => {
  test('lists the seeded personas and the configured models', () => {
    const { personas } = ok('list_personas');
    expect(personas.length).toBeGreaterThanOrEqual(8);
    expect(personas[0]).toHaveProperty('system_prompt');
    const models = ok('list_models');
    expect(models.default).toBe('DeepSeek 4 Flash');
    expect(models.models[0]).toEqual(
      { label: 'GPT-4o', openrouter_id: 'openai/gpt-4o' });
  });

  test('create_persona saves it to the library', () => {
    const made = ok('create_persona', {
      name: 'Devil’s Advocate',
      system_prompt: 'Argue the opposite of whatever is proposed.',
      model: 'openai/gpt-4o-mini', // an id resolves to its label
      colour: 'Red',
    });
    expect(made).toMatchObject({
      name: 'Devil’s Advocate', model: 'GPT-4o mini', output: 'text',
      colour: 'red',
    });
    expect(store.personas().some((p) => p.name === 'Devil’s Advocate'))
      .toBe(true);
    expect(changes).toEqual([{ personas: true }]);
  });

  test('create_persona deals a free colour and infers the output', () => {
    const made = ok('create_persona', {
      name: 'Painter', system_prompt: 'Paint it.',
      model: 'Gemini 2.5 Flash Image',
    });
    expect(made.output).toBe('image');
    // The seeds hold eight palette hues; the next free one is purple.
    expect(made.colour).toBe('purple');
  });

  test('create_persona refuses a name already taken, and bad fields', () => {
    expect(refusal('create_persona', { name: 'raffaello', system_prompt: 'x' }))
      .toContain('already has "Raffaello"');
    expect(refusal('create_persona', { name: 'X' }))
      .toContain('"system_prompt" is required');
    expect(refusal('create_persona', {
      name: 'X', system_prompt: 'x', model: 'gpt four',
    })).toContain('Unknown model "gpt four"');
    expect(refusal('create_persona', {
      name: 'X', system_prompt: 'x', output: 'video',
    })).toContain('"output" must be one of');
    expect(changes).toEqual([]);
  });

  test('update_persona edits the library entry only', () => {
    const before = store.personas().find((p) => p.personaType === 'red_hat')!;
    const updated = ok('update_persona', {
      persona: 'red hat', system_prompt: 'Only gut feelings.',
    });
    expect(updated).toMatchObject({ id: before.id, name: before.name });
    expect(store.personas().find((p) => p.id === before.id)!.systemPrompt)
      .toBe('Only gut feelings.');
    expect(refusal('update_persona', { persona: 'red hat' }))
      .toContain('Nothing to change');
    expect(refusal('update_persona', { persona: 'red hat', name: 'Iggy' }))
      .toContain('already has "Iggy"');
  });
});

describe('council', () => {
  test('compose_council lays out personas, overrides and one-off voices', () => {
    const council = ok('compose_council', {
      shared_prompt: 'Should we open a second shop?',
      members: [
        { persona: 'white hat' },
        { persona: 'Black Hat', model: 'GPT-4o', colour: 'yellow' },
        { name: 'Accountant', system_prompt: 'Run the numbers.' },
      ],
    });
    expect(council.shared_prompt).toBe('Should we open a second shop?');
    expect(council.members.map((m: { name: string }) => m.name)).toEqual(
      ['White Hat — Facts', 'Black Hat — Caution', 'Accountant']);
    expect(council.members[1]).toMatchObject({ model: 'GPT-4o', colour: 'yellow' });
    // The one-off voice takes the first palette hue nobody else holds.
    expect(council.members[2]).toMatchObject(
      { colour: 'blue', model: 'DeepSeek 4 Flash', output: 'text' });

    // It is the draft the window opens on, and the window was told.
    const draft = store.getOrCreateDraft();
    expect(draft.agents).toHaveLength(3);
    expect(changes).toEqual([{ convId: draft.id }]);
    // The library persona itself is untouched by the override.
    expect(store.personas().find((p) => p.personaType === 'black_hat')!.model)
      .toBe('DeepSeek 4 Flash');
  });

  test('a seed hat answers to its kind in any language', () => {
    open('it');
    const council = ok('compose_council', { members: ['black hat', 'Cappello Verde'] });
    expect(council.members.map((m: { name: string }) => m.name)).toEqual(
      ['Cappello Nero — Prudenza', 'Cappello Verde — Creatività']);
  });

  test('one bad member leaves the council as it was', () => {
    ok('compose_council', {
      shared_prompt: 'Keep me',
      members: [{ persona: 'white hat' }],
    });
    const message = refusal('compose_council', {
      members: [{ persona: 'yellow hat' }, { persona: 'Purple Hat' }],
    });
    expect(message).toContain('members[1]: No persona "Purple Hat"');
    expect(message).toContain('White Hat — Facts');
    const council = ok('get_council');
    expect(council.members.map((m: { name: string }) => m.name))
      .toEqual(['White Hat — Facts']);
    // Left out, the shared prompt stays; given empty, it is cleared.
    ok('compose_council', { members: [{ persona: 'red hat' }] });
    expect(ok('get_council').shared_prompt).toBe('Keep me');
    ok('compose_council', { members: ['red hat'], shared_prompt: '' });
    expect(ok('get_council').shared_prompt).toBe('');
  });

  test('a reference that names nothing, or too much, says what would do', () => {
    expect(refusal('compose_council', { members: [{ persona: 'Hat' }] }))
      .toBe('members[0]: No persona "Hat". There are: ' + store.personas()
        .map((p) => `${p.name} (id ${p.id})`).join(', ') + '.');
    // A prefix is enough while only one name starts with it...
    expect(ok('add_member', { persona: 'White' }).members[1].name)
      .toBe('White Hat — Facts');
    // ...and asks for the id once two do.
    ok('create_persona', { name: 'White Noise', system_prompt: 'shh' });
    expect(refusal('add_member', { persona: 'White' }))
      .toContain('matches more than one persona');
  });

  test('members are added, edited and removed by name or id', () => {
    ok('compose_council', { members: ['white hat', 'red hat'] });
    let council = ok('add_member', { persona: 'green hat', name: 'Ideas' });
    expect(council.members).toHaveLength(3);
    expect(council.members[2]).toMatchObject({ name: 'Ideas', colour: 'green' });

    council = ok('update_member', {
      member: 'ideas', system_prompt: 'Wild ideas only.', output: 'image',
    });
    expect(council.members[2]).toMatchObject(
      { system_prompt: 'Wild ideas only.', output: 'image' });

    const id = council.members[0].id;
    council = ok('remove_member', { member: id });
    expect(council.members.map((m: { name: string }) => m.name))
      .toEqual(['Red Hat — Feelings', 'Ideas']);
    ok('remove_member', { member: 'red' });
    expect(refusal('remove_member', { member: 'ideas' }))
      .toContain('at least one member');
    expect(refusal('update_member', { member: 'nobody', name: 'x' }))
      .toContain('No member "nobody". There is: Ideas');
  });

  test('set_shared_prompt and get_council', () => {
    ok('set_shared_prompt', { text: 'Context for all.' });
    expect(ok('get_council')).toMatchObject({
      shared_prompt: 'Context for all.',
      members: [{ name: 'Simple Jack' }],
    });
    expect(refusal('set_shared_prompt', {})).toContain('"text" is required');
  });

  test('a council already under way is never rewritten', () => {
    const draft = store.getOrCreateDraft();
    store.send(draft.id, 'hello');
    // The next tool works on a fresh draft, not on the running session.
    ok('compose_council', { members: ['white hat'] });
    expect(store.conversation(draft.id).agents[0]!.name).toBe('Simple Jack');
    expect(store.getOrCreateDraft().id).not.toBe(draft.id);
  });
});

describe('socket and bridge', () => {
  const endpoint = () => (process.platform === 'win32'
    ? `\\\\.\\pipe\\strophae-test-${process.pid}-${Date.now()}`
    : join(dir, 'mcp.sock'));

  const INIT = {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18' },
  };

  test('one session per connection, one message per line', async () => {
    const where = endpoint();
    const server = serveMcp(where, () => new McpSession(INFO, tools));
    await new Promise((r) => server.once('listening', r));
    try {
      const replies = await exchange(where, [
        INIT,
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        {
          jsonrpc: '2.0', id: 2, method: 'tools/call',
          params: { name: 'add_member', arguments: { persona: 'iggy' } },
        },
      ]) as { id: number; result: ToolResult }[];
      expect(replies.map((r) => r.id)).toEqual([1, 2]);
      const council = JSON.parse(replies[1]!.result.content[0]!.text);
      expect(council.members[1]).toMatchObject({ name: 'Iggy', output: 'audio' });
    } finally {
      server.close();
    }
  });

  test('the bridge relays stdio to the app', async () => {
    const where = endpoint();
    const server = serveMcp(where, () => new McpSession(INFO, tools));
    await new Promise((r) => server.once('listening', r));
    try {
      const bridge = Bun.spawn(['bun', 'src/mcp/bridge.ts'], {
        env: { ...process.env, STROPHAE_MCP_ENDPOINT: where },
        stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
      });
      bridge.stdin.write(`${JSON.stringify(INIT)}\n`);
      bridge.stdin.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' })}\n`);
      bridge.stdin.end();
      const out = await new Response(bridge.stdout).text();
      expect(await bridge.exited).toBe(0);
      const replies = out.trim().split('\n').map((l) => JSON.parse(l));
      expect(replies.map((r) => r.id)).toEqual([1, 2]);
      expect(replies[0].result.serverInfo.name).toBe('strophae');
    } finally {
      server.close();
    }
  });

  test('the bridge says so, on stderr, when there is no app to reach', async () => {
    const bridge = Bun.spawn(['bun', 'src/mcp/bridge.ts'], {
      env: { ...process.env, STROPHAE_MCP_ENDPOINT: endpoint() },
      stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
    });
    expect(await bridge.exited).toBe(1);
    expect(await new Response(bridge.stdout).text()).toBe('');
    expect(await new Response(bridge.stderr).text())
      .toContain('not listening');
  });
});
