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
  saveAttachment: invoke('att:save'),
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
  mcpConfig: invoke('mcp:config'),
  // Pushed by the main process when a connected MCP client changes the
  // council or the library; returns the unsubscribe.
  onMcpChanged: (listener: (change: unknown) => void) => {
    const relay = (_e: unknown, change: unknown) => listener(change);
    ipcRenderer.on('mcp:changed', relay);
    return () => {
      ipcRenderer.removeListener('mcp:changed', relay);
    };
  },
  checkShot: invoke('check:shot'),
  checkReady: invoke('check:ready'),
  checkMcp: invoke('check:mcp'),
};

export type StrophaeApi = typeof api;

contextBridge.exposeInMainWorld('strophae', api);
