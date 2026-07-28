// IPC surface between the sandboxed renderer and the main process.
// The OpenRouter key is encrypted at rest with Electron safeStorage (OS
// keychain); the renderer receives it only to call OpenRouter directly.

import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron';

import { translate } from '../shared/i18n';
import type {
  AppState, Attachment, Language, ModelEntry,
} from '../shared/types';
import {
  copyAttachmentTo,
  deleteAttachmentFiles,
  importAttachment,
  importDataUrl,
  PICK_EXTENSIONS,
  readAttachment,
} from './attachments';
import type { Store } from './store';

export function keyPath(dir: string): string {
  return join(dir, 'openrouter.key');
}

export function loadApiKey(dir: string): string {
  try {
    return safeStorage.decryptString(readFileSync(keyPath(dir)));
  } catch {
    return '';
  }
}

export function saveApiKey(dir: string, value: string): void {
  if (!value) {
    try {
      unlinkSync(keyPath(dir));
    } catch { /* not set */ }
    return;
  }
  writeFileSync(keyPath(dir), safeStorage.encryptString(value));
}

export function registerIpc(store: Store, dir: string,
                            osLang: 'en' | 'it'): void {
  const state = (): AppState => ({
    conversations: store.conversations(),
    personas: store.personas(),
    settings: store.settings(),
    apiKeySet: loadApiKey(dir).length > 0,
    osLanguage: osLang,
  });

  ipcMain.handle('state:get', () => state());
  ipcMain.handle('draft:get', () => store.getOrCreateDraft());

  ipcMain.handle('conv:delete', (_e, id: number) =>
    store.deleteConversation(id));
  ipcMain.handle('conv:setShared', (_e, id: number, text: string) =>
    store.setSharedPrompt(id, text));

  ipcMain.handle('agent:add', (_e, convId: number) => store.addAgent(convId));
  ipcMain.handle('agent:addFromPersona',
    (_e, convId: number, personaId: number) =>
      store.addAgentFromPersona(convId, personaId));
  ipcMain.handle('agent:update', (_e, agentId: number, fields: object) =>
    store.updateAgent(agentId, fields));
  ipcMain.handle('agent:remove', (_e, agentId: number) =>
    store.removeAgent(agentId));
  ipcMain.handle('agent:clear', (_e, agentId: number) =>
    store.clearThread(agentId));
  ipcMain.handle('persona:save', (_e, agentId: number) =>
    store.savePersona(agentId));
  ipcMain.handle('persona:delete', (_e, personaId: number) =>
    store.deletePersona(personaId));

  ipcMain.handle('msg:send',
    (_e, convId: number, text: string, atts: Attachment[] = []) =>
      store.send(convId, text, atts));
  // `media` are data: URLs the model generated during this stream (images,
  // or a WAV the renderer assembled from streamed audio); each is persisted
  // as an image/audio attachment of the assistant message.
  ipcMain.handle('msg:finalize',
    (_e, messageId: number, text: string, media: string[] = []) => {
      const atts: Attachment[] = [];
      for (const url of media) {
        try {
          atts.push(importDataUrl(dir, store.claimId(), url));
        } catch { /* skip malformed/oversized media */ }
      }
      store.finalizeMessage(messageId, text, atts);
    });

  // Picked files are imported (doc/docx reduced to text) before any bind;
  // the renderer then attaches them to a conversation, agent or message.
  ipcMain.handle('att:pick', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const picked = win && await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [{
        name: translate(store.lang(), 'file_filter'),
        extensions: PICK_EXTENSIONS,
      }],
    });
    const attachments: Attachment[] = [];
    const errors: string[] = [];
    for (const path of (!picked || picked.canceled) ? [] : picked.filePaths) {
      try {
        attachments.push(await importAttachment(dir, store.claimId(), path));
      } catch {
        errors.push(basename(path));
      }
    }
    return { attachments, errors };
  });
  ipcMain.handle('att:data', (_e, att: Attachment) =>
    readAttachment(dir, att));
  ipcMain.handle('att:discard', (_e, att: Attachment) =>
    deleteAttachmentFiles(dir, [att]));
  // Save a stored attachment (a generated image) to a folder the user picks;
  // resolves true when written, false when the dialog was dismissed.
  ipcMain.handle('att:save', async (e, att: Attachment) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return false;
    const ext = (att.name.split('.').pop() ?? '').toLowerCase();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: att.name,
      filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [],
    });
    if (canceled || !filePath) return false;
    copyAttachmentTo(dir, att, filePath);
    return true;
  });

  ipcMain.handle('conv:attach', (_e, convId: number, atts: Attachment[]) =>
    store.attachToConversation(convId, atts));
  ipcMain.handle('conv:detach', (_e, convId: number, attId: number) =>
    store.detachFromConversation(convId, attId));
  ipcMain.handle('agent:attach', (_e, agentId: number, atts: Attachment[]) =>
    store.attachToAgent(agentId, atts));
  ipcMain.handle('agent:detach', (_e, agentId: number, attId: number) =>
    store.detachFromAgent(agentId, attId));

  ipcMain.handle('settings:setLanguage', (_e, language: Language) =>
    store.setLanguage(language));
  ipcMain.handle('settings:setModels', (_e, models: ModelEntry[]) =>
    store.setModels(models));
  ipcMain.handle('apikey:get', () => loadApiKey(dir));
  ipcMain.handle('apikey:set', (_e, value: string) => saveApiKey(dir, value));

  // Links in rendered markdown replies open in the user's browser, never in
  // the app window (which stays pinned to the bundled index.html). Only web
  // and mail schemes are ever handed to the OS — the LLM output is untrusted,
  // so file:, javascript: and the like are refused here as a backstop.
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    let scheme = '';
    try {
      scheme = new URL(url).protocol;
    } catch { /* not a URL */ }
    if (scheme === 'http:' || scheme === 'https:' || scheme === 'mailto:') {
      return shell.openExternal(url);
    }
  });
}
