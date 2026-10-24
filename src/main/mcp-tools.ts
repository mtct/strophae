// The tools a connected MCP client gets (mcp.ts carries them): read the
// persona library and the model list, add to and edit the library, and lay
// out the council on the compose page.
//
// "The council" is always the session draft — the one the sidebar's
// new-session button opens — so what a client composes is exactly what the
// person sees, and starts with the red control. Nothing here sends a prompt,
// reads a conversation or touches the API key: a client composes, the person
// commits.
//
// The arguments come from a language model, often a small local one, so
// they are read leniently and refused in plain words: a persona answers to
// its id, its name, a prefix of it, or (for the seed hats) its kind in any
// language; a refusal lists what would have worked.

import { defaultModality, modelSlug, nextHue } from '../shared/models';
import type {
  Agent, Conversation, McpChange, Modality, Persona,
} from '../shared/types';
import type { McpTool } from './mcp';
import type { AgentFields, Store } from './store';

export const COUNCIL_INSTRUCTIONS = [
  'Strophae puts one prompt to a council of AI personas at once; each member',
  'answers in its own column, with its own model and system prompt. These',
  'tools compose that council in the running Strophae app, from its local',
  'persona library.',
  '',
  'Typical flow: list_personas (the library ships with the Six Thinking Hats',
  'plus an image and an audio persona) → compose_council with the members',
  'the user asked for and, when useful, a shared_prompt → refine with',
  'update_member, add_member, remove_member or set_shared_prompt →',
  'create_persona for a voice worth keeping. Every member reads the shared',
  'prompt first, then its own system prompt.',
  '',
  "The council appears on Strophae's compose page as it is built. The user",
  'reviews it there and starts the chat themselves: no tool here sends a',
  'prompt to the council or reads its conversations.',
].join('\n');

// The palette by name: a model asked for "the red one" should not have to
// know oklch angles. Named after the ink each hue prints as (theme.ts).
const COLOURS: Record<string, number> = {
  blue: 255, red: 30, yellow: 100, green: 150, teal: 200,
  purple: 310, magenta: 340, orange: 60, violet: 285, crimson: 20,
};

const OUTPUTS: Modality[] = ['text', 'image', 'audio'];

type Args = Record<string, unknown>;
type Edits = Partial<
  Pick<Agent, 'name' | 'hue' | 'model' | 'modality' | 'systemPrompt'>>;
/** A member or persona being built: its colour waits for the palette when
    nothing chose one. */
type Voice = Omit<AgentFields, 'hue'> & { hue?: number };

// ------------------------------------------------------------- arguments

function text(args: Args, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`"${key}" must be a string.`);
  return value;
}

function required(args: Args, key: string): string {
  const value = text(args, key);
  if (value === undefined) throw new Error(`"${key}" is required.`);
  return value;
}

/** A name, trimmed; given empty is a mistake, not a way to clear it. */
function name(args: Args, key = 'name'): string | undefined {
  const value = text(args, key)?.trim();
  if (value === '') throw new Error(`"${key}" cannot be empty.`);
  return value;
}

/** A reference to a persona or member: its name, or its id as a number. */
function reference(args: Args, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'number' ? String(value) : name(args, key);
}

function output(args: Args): Modality | undefined {
  const value = text(args, 'output')?.trim().toLowerCase();
  if (value === undefined) return undefined;
  if (!OUTPUTS.includes(value as Modality)) {
    throw new Error(`"output" must be one of: ${OUTPUTS.join(', ')}.`);
  }
  return value as Modality;
}

function colour(args: Args): number | undefined {
  // Spelled either way: the schema says "colour", a model may well not.
  const key = args.colour !== undefined ? 'colour' : 'color';
  const value = text(args, key)?.trim().toLowerCase();
  if (value === undefined) return undefined;
  const hue = COLOURS[value];
  if (hue === undefined) {
    throw new Error(`"colour" must be one of: ${Object.keys(COLOURS).join(', ')}.`);
  }
  return hue;
}

/** A configured model by label or OpenRouter id, as its label. Any other
    OpenRouter id is taken as it stands — a raw id works as a label
    (modelSlug falls back to it). */
function model(store: Store, args: Args): string | undefined {
  const value = text(args, 'model')?.trim();
  if (value === undefined) return undefined;
  const models = store.settings().models;
  const same = (a: string) => a.toLowerCase() === value.toLowerCase();
  const hit = models.find((m) => same(m.label))
    ?? models.find((m) => same(m.slug));
  if (hit) return hit.label;
  if (/^[\w.-]+\/[\w.:~-]+$/.test(value)) return value;
  throw new Error(
    `Unknown model "${value}". Configured: ${
      models.map((m) => m.label).join(', ')} — or pass an OpenRouter id `
    + 'such as "openai/gpt-4o".');
}

// --------------------------------------------------------------- lookups

interface Named {
  id: number;
  name: string;
  personaType: string;
}

/** Case, accents and punctuation folded away: "Black Hat — Caution" and
    "black hat caution" are one name. */
const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const tag = (item: Named) => `${item.name} (id ${item.id})`;

/** The one item `ref` names, trying the strictest reading first. */
function lookup<T extends Named>(items: T[], ref: string, what: string): T {
  const id = /^#?\d+$/.test(ref) ? Number(ref.replace('#', '')) : NaN;
  const byId = items.find((i) => i.id === id);
  if (byId) return byId;
  const key = fold(ref);
  const readings: ((item: T) => boolean)[] = [
    (i) => fold(i.name) === key,
    // The seed hats answer to their kind ("black hat") in any language.
    (i) => i.personaType !== 'generic' && fold(i.personaType) === key,
    (i) => key !== '' && fold(i.name).startsWith(key),
  ];
  for (const reading of readings) {
    const hits = items.filter(reading);
    if (hits.length === 1) return hits[0]!;
    if (hits.length > 1) {
      throw new Error(`"${ref}" matches more than one ${what}: ${
        hits.map(tag).join(', ')}. Pass the id.`);
    }
  }
  throw new Error(`No ${what} "${ref}". There ${
    items.length === 1 ? 'is' : 'are'}: ${
    items.map(tag).join(', ') || 'none'}.`);
}

function persona(store: Store, args: Args, key = 'persona'): Persona {
  const ref = reference(args, key);
  if (ref === undefined) throw new Error(`"${key}" is required.`);
  return lookup(store.personas(), ref, 'persona');
}

function member(store: Store, args: Args): Agent {
  const ref = reference(args, 'member');
  if (ref === undefined) throw new Error('"member" is required.');
  return lookup(store.getOrCreateDraft().agents, ref, 'member');
}

/** The persona library may hold a name once, or "by name" stops working. */
function unclaimed(store: Store, wanted: string, except?: number): void {
  const clash = store.personas().find(
    (p) => p.id !== except && fold(p.name) === fold(wanted));
  if (clash) {
    throw new Error(`The library already has "${clash.name}" (id ${
      clash.id}). Pick another name, or edit that one with update_persona.`);
  }
}

// ----------------------------------------------------------------- voices

/** A member as compose_council and add_member take it: a library persona,
    with whatever the spec overrides, or a one-off voice of its own. */
function voice(store: Store, spec: Args): Voice {
  const base = spec.persona === undefined || spec.persona === null
    ? undefined
    : persona(store, spec);
  const named = name(spec) ?? base?.name;
  if (!named) {
    throw new Error('A member needs a "persona" from the library, or a '
      + '"name" (and a "system_prompt") of its own.');
  }
  const chosen = model(store, spec) ?? base?.model ?? store.defaultModel();
  return {
    name: named,
    model: chosen,
    modality: output(spec) ?? base?.modality
      ?? defaultModality(modelSlug(chosen, store.settings().models)),
    systemPrompt: text(spec, 'system_prompt') ?? base?.systemPrompt ?? '',
    personaType: base?.personaType ?? 'generic',
    hue: colour(spec) ?? base?.hue,
  };
}

/** Give every voice nobody coloured the next palette hue the others leave
    free, so a fresh council still reads blue, red, yellow. */
function deal(voices: Voice[], taken: number[] = []): AgentFields[] {
  const used = [...taken, ...voices.flatMap((v) => v.hue ?? [])];
  return voices.map((v) => {
    if (v.hue !== undefined) return { ...v, hue: v.hue };
    const hue = nextHue(used);
    used.push(hue);
    return { ...v, hue };
  });
}

/** The changes update_member and update_persona were asked for. */
function edits(store: Store, args: Args): Edits {
  const fields: Edits = {};
  const renamed = name(args);
  if (renamed !== undefined) fields.name = renamed;
  const prompt = text(args, 'system_prompt');
  if (prompt !== undefined) fields.systemPrompt = prompt;
  const chosen = model(store, args);
  if (chosen !== undefined) fields.model = chosen;
  const modality = output(args);
  if (modality !== undefined) fields.modality = modality;
  const hue = colour(args);
  if (hue !== undefined) fields.hue = hue;
  if (Object.keys(fields).length === 0) {
    throw new Error('Nothing to change: pass at least one of name, '
      + 'system_prompt, model, output, colour.');
  }
  return fields;
}

// ---------------------------------------------------------------- answers

const colourOf = (hue: number) =>
  Object.entries(COLOURS).find(([, h]) => h === hue)?.[0] ?? `hue ${hue}`;

const files = (key: string, atts?: { name: string }[]) =>
  (atts?.length ? { [key]: atts.map((a) => a.name) } : {});

function personaView(p: Persona) {
  return {
    id: p.id,
    name: p.name,
    model: p.model,
    output: p.modality,
    colour: colourOf(p.hue),
    system_prompt: p.systemPrompt,
  };
}

function councilView(conv: Conversation) {
  return {
    shared_prompt: conv.sharedSystemPrompt,
    ...files('shared_files', conv.attachments),
    members: conv.agents.map((a) => ({
      id: a.id,
      name: a.name,
      model: a.model,
      output: a.modality,
      colour: colourOf(a.hue),
      system_prompt: a.systemPrompt,
      ...files('files', a.attachments),
    })),
  };
}

// ----------------------------------------------------------------- schemas

const VOICE_PROPERTIES = {
  name: {
    type: 'string',
    description: 'Name shown at the head of its column.',
  },
  system_prompt: {
    type: 'string',
    description: 'Its own system prompt, read after the shared prompt.',
  },
  model: {
    type: 'string',
    description: 'A model label from list_models, or an OpenRouter model id '
      + 'such as "openai/gpt-4o".',
  },
  output: {
    type: 'string',
    enum: OUTPUTS,
    description: 'What it answers with: text, a generated image, or spoken '
      + 'audio. Image and audio need a model that produces them.',
  },
  colour: {
    type: 'string',
    enum: Object.keys(COLOURS),
    description: 'The colour of its column.',
  },
};

const MEMBER_PROPERTIES = {
  persona: {
    type: 'string',
    description: 'A persona from the library, by name or id. Leave it out '
      + 'for a one-off voice given by name and system_prompt; any other '
      + 'field given overrides the persona for this council only.',
  },
  ...VOICE_PROPERTIES,
};

const schema = (properties: object = {}, needed: string[] = []) => ({
  type: 'object',
  properties,
  ...(needed.length ? { required: needed } : {}),
});

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
const ADDS = {
  readOnlyHint: false, destructiveHint: false, idempotentHint: false,
  openWorldHint: false,
};
const REPLACES = {
  readOnlyHint: false, destructiveHint: true, idempotentHint: true,
  openWorldHint: false,
};

// ------------------------------------------------------------------ tools

export function councilTools(store: Store,
                             changed: (change: McpChange) => void): McpTool[] {
  const draft = () => store.getOrCreateDraft();
  /** Show the window the council as it now stands, and the client too. */
  const composed = (conv: Conversation) => {
    changed({ convId: conv.id });
    return councilView(store.conversation(conv.id));
  };

  return [
    {
      name: 'list_personas',
      title: 'List personas',
      description: 'List the personas saved in the Strophae library: id, '
        + 'name, model, output, colour and system prompt. Refer to one by '
        + 'name or id in compose_council and add_member.',
      inputSchema: schema(),
      annotations: READ_ONLY,
      run: () => ({ personas: store.personas().map(personaView) }),
    },
    {
      name: 'list_models',
      title: 'List models',
      description: "List the models configured in Strophae's settings, as "
        + 'label and OpenRouter id, and the default one. A model is given '
        + 'by its label; any other OpenRouter id ("provider/model") works '
        + 'too.',
      inputSchema: schema(),
      annotations: READ_ONLY,
      run: () => ({
        models: store.settings().models.map((m) => (
          { label: m.label, openrouter_id: m.slug })),
        default: store.defaultModel(),
      }),
    },
    {
      name: 'create_persona',
      title: 'Create persona',
      description: 'Create a persona and save it in the Strophae library, so '
        + 'it can sit on any future council. To seat it on the current '
        + 'council as well, follow with add_member.',
      inputSchema: schema(VOICE_PROPERTIES, ['name', 'system_prompt']),
      annotations: ADDS,
      run: (args) => {
        required(args, 'name');
        required(args, 'system_prompt');
        const fields = voice(store, { ...args, persona: undefined });
        unclaimed(store, fields.name);
        const [dealt] = deal([fields], store.personas().map((p) => p.hue));
        const created = store.createPersona(dealt!);
        changed({ personas: true });
        return personaView(created);
      },
    },
    {
      name: 'update_persona',
      title: 'Update persona',
      description: 'Edit a persona in the Strophae library. Councils already '
        + 'composed keep their own copy; to change a member of the current '
        + 'council, use update_member.',
      inputSchema: schema({
        persona: {
          type: 'string',
          description: 'The persona to edit, by name or id.',
        },
        ...VOICE_PROPERTIES,
        name: { type: 'string', description: 'A new name for it.' },
      }, ['persona']),
      annotations: REPLACES,
      run: (args) => {
        const target = persona(store, args);
        const fields = edits(store, args);
        if (fields.name) unclaimed(store, fields.name, target.id);
        const updated = store.updatePersona(target.id, fields);
        changed({ personas: true });
        return personaView(updated);
      },
    },
    {
      name: 'get_council',
      title: 'Get council',
      description: 'Show the council being composed in Strophae: the shared '
        + 'prompt every member reads, and each member with its name, model, '
        + 'output, colour and system prompt.',
      inputSchema: schema(),
      annotations: READ_ONLY,
      run: () => councilView(draft()),
    },
    {
      name: 'compose_council',
      title: 'Compose council',
      description: 'Lay out the council in Strophae, replacing the lineup on '
        + 'its compose page. Each member is a persona from the library (by '
        + 'name or id), optionally with overrides, or a one-off voice given '
        + 'by name and system_prompt. Members are seated in the order given.',
      inputSchema: schema({
        members: {
          type: 'array',
          minItems: 1,
          items: schema(MEMBER_PROPERTIES),
          description: 'The council, in seating order.',
        },
        shared_prompt: {
          type: 'string',
          description: 'Context every member reads before its own system '
            + 'prompt. Left out, the current one stays; "" clears it.',
        },
      }, ['members']),
      annotations: REPLACES,
      run: (args) => {
        const specs = args.members;
        if (!Array.isArray(specs) || specs.length === 0) {
          throw new Error('"members" must list at least one member.');
        }
        // Every member is read before anything changes: one bad entry
        // leaves the council as it was.
        const voices = specs.map((spec, i) => {
          try {
            if (typeof spec === 'string') return voice(store, { persona: spec });
            if (typeof spec !== 'object' || spec === null) {
              throw new Error('expected an object');
            }
            return voice(store, spec as Args);
          } catch (err) {
            throw new Error(`members[${i}]: ${(err as Error).message}`);
          }
        });
        const shared = text(args, 'shared_prompt');
        const conv = draft();
        store.setLineup(conv.id, deal(voices));
        if (shared !== undefined) store.setSharedPrompt(conv.id, shared);
        return composed(conv);
      },
    },
    {
      name: 'set_shared_prompt',
      title: 'Set shared prompt',
      description: 'Set the shared prompt: context every member of the '
        + 'council reads before its own system prompt. An empty text '
        + 'clears it.',
      inputSchema: schema({
        text: { type: 'string', description: 'The shared prompt.' },
      }, ['text']),
      annotations: REPLACES,
      run: (args) => {
        const shared = required(args, 'text');
        const conv = draft();
        store.setSharedPrompt(conv.id, shared);
        return composed(conv);
      },
    },
    {
      name: 'add_member',
      title: 'Add member',
      description: 'Seat one more member on the council: a persona from the '
        + 'library (by name or id), optionally with overrides, or a one-off '
        + 'voice given by name and system_prompt.',
      inputSchema: schema(MEMBER_PROPERTIES),
      annotations: ADDS,
      run: (args) => {
        const conv = draft();
        const [fields] = deal([voice(store, args)],
          conv.agents.map((a) => a.hue));
        store.addAgentWith(conv.id, fields!);
        return composed(conv);
      },
    },
    {
      name: 'update_member',
      title: 'Update member',
      description: 'Change one member of the council: its name, system '
        + 'prompt, model, output or colour. The library persona it came from '
        + 'stays as it is; use update_persona for that.',
      inputSchema: schema({
        member: {
          type: 'string',
          description: 'The member to change, by name or id.',
        },
        ...VOICE_PROPERTIES,
        name: { type: 'string', description: 'A new name for it.' },
      }, ['member']),
      annotations: REPLACES,
      run: (args) => {
        const target = member(store, args);
        store.updateAgent(target.id, edits(store, args));
        return composed(draft());
      },
    },
    {
      name: 'remove_member',
      title: 'Remove member',
      description: 'Take a member off the council. A council keeps at least '
        + 'one member.',
      inputSchema: schema({
        member: {
          type: 'string',
          description: 'The member to remove, by name or id.',
        },
      }, ['member']),
      annotations: { ...REPLACES, idempotentHint: false },
      run: (args) => {
        const target = member(store, args);
        const conv = draft();
        if (conv.agents.length <= 1) {
          throw new Error('A council keeps at least one member: add another '
            + 'first, or use compose_council to replace the lineup.');
        }
        store.removeAgent(target.id);
        return composed(conv);
      },
    },
  ];
}
