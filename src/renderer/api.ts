// Typed access to the preload bridge.

import type {
  Agent,
  AppState,
  Attachment,
  Conversation,
  Language,
  ModelEntry,
  Persona,
  SendResult,
  Settings,
} from '../shared/types';

export interface PickResult {
  attachments: Attachment[];
  errors: string[]; // basenames of files that could not be imported
}

export interface StrophaeApi {
  getState(): Promise<AppState>;
  getDraft(): Promise<Conversation>;
  deleteConversation(id: number): Promise<void>;
  setSharedPrompt(id: number, text: string): Promise<void>;
  addAgent(convId: number): Promise<Agent>;
  addAgentFromPersona(convId: number, personaId: number): Promise<Agent>;
  updateAgent(agentId: number, fields: Partial<
    Pick<Agent, 'name' | 'hue' | 'model' | 'systemPrompt'>>): Promise<Agent>;
  removeAgent(agentId: number): Promise<void>;
  clearThread(agentId: number): Promise<void>;
  savePersona(agentId: number): Promise<Persona>;
  sendMessage(convId: number, text: string,
              attachments?: Attachment[]): Promise<SendResult>;
  finalizeMessage(messageId: number, text: string,
                  images?: string[]): Promise<void>;
  pickAttachments(): Promise<PickResult>;
  /** Plain text for kind 'text', a data: URL for image/pdf. */
  attachmentData(att: Attachment): Promise<string>;
  discardAttachment(att: Attachment): Promise<void>;
  attachToConversation(convId: number,
                       atts: Attachment[]): Promise<Conversation>;
  detachFromConversation(convId: number, attId: number): Promise<Conversation>;
  attachToAgent(agentId: number, atts: Attachment[]): Promise<Agent>;
  detachFromAgent(agentId: number, attId: number): Promise<Agent>;
  setLanguage(language: Language): Promise<void>;
  setModels(models: ModelEntry[]): Promise<Settings>;
  getApiKey(): Promise<string>;
  setApiKey(value: string): Promise<void>;
  checkShot(name: string): Promise<void>;
  checkReady(report: Record<string, boolean>): Promise<void>;
}

declare global {
  interface Window {
    strophae: StrophaeApi;
  }
}

export const api: StrophaeApi = window.strophae;
