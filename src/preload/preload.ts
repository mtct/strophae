// Sandboxed bridge: the renderer sees only this typed, promise-based API.

import { contextBridge, ipcRenderer } from 'electron';

const invoke = (channel: string) =>
  (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

const api = {
  getState: invoke('state:get'),
  getDraft: invoke('draft:get'),
  deleteConversation: invoke('conv:delete'),
  setSharedPrompt: invoke('conv:setShared'),
  addAgent: invoke('agent:add'),
  addAgentFromPersona: invoke('agent:addFromPersona'),
  updateAgent: invoke('agent:update'),
  removeAgent: invoke('agent:remove'),
  clearThread: invoke('agent:clear'),
  savePersona: invoke('persona:save'),
  deletePersona: invoke('persona:delete'),
  sendMessage: invoke('msg:send'),
  finalizeMessage: invoke('msg:finalize'),
  pickAttachments: invoke('att:pick'),
  attachmentData: invoke('att:data'),
  discardAttachment: invoke('att:discard'),
  attachToConversation: invoke('conv:attach'),
  detachFromConversation: invoke('conv:detach'),
  attachToAgent: invoke('agent:attach'),
  detachFromAgent: invoke('agent:detach'),
  setLanguage: invoke('settings:setLanguage'),
  setModels: invoke('settings:setModels'),
  getApiKey: invoke('apikey:get'),
  setApiKey: invoke('apikey:set'),
  openExternal: invoke('shell:openExternal'),
  checkShot: invoke('check:shot'),
  checkReady: invoke('check:ready'),
};

export type StrophaeApi = typeof api;

contextBridge.exposeInMainWorld('strophae', api);
