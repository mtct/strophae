// Domain model — the TypeScript port of the retired Django chat/models.py.

export type Role = 'user' | 'assistant';

// How an attachment travels to the model: images and PDFs go as base64
// content parts; every document format (md/txt/csv, plus doc/docx after
// extraction in the main process) is inlined as text.
export type AttachmentKind = 'image' | 'pdf' | 'text';

export interface Attachment {
  id: number;
  name: string; // original file name
  mime: string;
  kind: AttachmentKind;
  size: number; // bytes of the original file
}

export interface Message {
  id: number;
  role: Role;
  text: string;
  createdAt: string; // ISO
  attachments?: Attachment[];
}

export interface Agent {
  id: number;
  name: string;
  hue: number;
  model: string; // display label; slug via modelSlug(label, models)
  personaType: string;
  systemPrompt: string;
  order: number;
  messages: Message[];
  attachments?: Attachment[]; // context files for this agent only
}

export interface Conversation {
  id: number;
  title: string;
  sharedSystemPrompt: string;
  createdAt: string;
  updatedAt: string;
  agents: Agent[];
  attachments?: Attachment[]; // shared context files for every agent
}

export interface Persona {
  id: number;
  name: string;
  hue: number;
  model: string;
  personaType: string;
  systemPrompt: string;
  createdAt: string;
}

export type Language = '' | 'en' | 'it'; // '' = follow the OS

// One selectable model: display label + the OpenRouter model string sent
// as `model` in chat/completions (e.g. "openai/gpt-4o").
export interface ModelEntry {
  label: string;
  slug: string;
}

export interface Settings {
  language: Language;
  models: ModelEntry[]; // user-editable; seeded from DEFAULT_MODELS
}

export interface AppState {
  conversations: Conversation[];
  personas: Persona[];
  settings: Settings;
  apiKeySet: boolean;
  osLanguage: 'en' | 'it';
}

// One send: the ids of the empty assistant slots created per agent.
export interface SendResult {
  conversation: Conversation;
  slotIds: Record<number, number>; // agentId -> messageId
}
