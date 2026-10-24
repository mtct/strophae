// Strophae — Electron main process.
//
// `electron . --check [shots-dir]` runs the headless smoke test: boot the
// app offscreen, wait for the renderer's readiness report, optionally save
// screenshots, exit 0/1. Mirrors the verification mode of the previous
// native builds.
//
// The main process also serves the MCP endpoint local clients compose the
// council through (mcp.ts, mcp-tools.ts); their bridge starts the app when
// it is not running.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { app, BrowserWindow, ipcMain, session } from 'electron';

import { registerIpc } from './ipc';
import { exchange, mcpEndpoint, McpSession, serveMcp } from './mcp';
import { COUNCIL_INSTRUCTIONS, councilTools } from './mcp-tools';
import { Store } from './store';

const CHECK = process.argv.includes('--check');
const shotsDir = CHECK
  ? process.argv[process.argv.indexOf('--check') + 1]
  : undefined;

// The self-test must never touch (or screenshot) the real profile: give it
// a throwaway userData so it always walks a fresh, seeded store.
if (CHECK) {
  app.setPath('userData', mkdtempSync(join(tmpdir(), 'strophae-check-')));
}

// One app per profile. Two would each hold strophae.json in memory and
// write over each other — a second launch from a Windows shortcut was
// enough, and so now is an MCP bridge starting the app while it is still
// coming up. The lock lives in userData, so the self-test's throwaway
// profile never contends with a copy the developer has open.
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();

let store: Store;

function osLanguage(): 'en' | 'it' {
  return app.getLocale().toLowerCase().startsWith('it') ? 'it' : 'en';
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: !CHECK,
    title: 'strophae',
    // The paper board of the renderer, so the window never flashes white.
    backgroundColor: '#e9e5db',
    webPreferences: {
      // Bun inlines __dirname to the *source* dir at bundle time, so paths
      // must go through the app root instead.
      preload: join(app.getAppPath(), 'dist/preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The hidden self-test window must keep timers and painting live,
      // or its scripted walk stalls under Chromium's throttling.
      backgroundThrottling: !CHECK,
    },
  });
  // The renderer displays untrusted LLM output; it must never open
  // windows or leave the bundled index.html.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile('dist/renderer/index.html',
    CHECK ? { query: { check: '1' } } : undefined);
  return win;
}

app.whenReady().then(() => {
  if (!primary) return;
  // Chromium permissions: only the clipboard write behind "Export"
  // is ever legitimate; geolocation, media, notifications etc. are not.
  session.defaultSession.setPermissionRequestHandler(
    (_wc, permission, callback) =>
      callback(permission === 'clipboard-sanitized-write'));

  const dir = app.getPath('userData');
  store = new Store(dir, osLanguage());
  registerIpc(store, dir, osLanguage(), { ephemeralKey: CHECK });

  // The self-test serves MCP from its throwaway profile, clear of the
  // endpoint a running copy of the app holds.
  const endpoint = !CHECK ? mcpEndpoint()
    : process.platform === 'win32'
      ? `\\\\.\\pipe\\strophae-check-${process.pid}`
      : join(dir, 'mcp.sock');
  const tools = councilTools(store, (change) => {
    const windows = BrowserWindow.getAllWindows();
    // A council laid out with every window closed (macOS keeps running)
    // opens one, which lands on the draft — the council itself.
    if (windows.length === 0 && change.convId !== undefined) createWindow();
    for (const w of windows) w.webContents.send('mcp:changed', change);
  });
  const info = {
    name: 'strophae',
    title: 'Strophae',
    version: app.getVersion(),
    instructions: COUNCIL_INSTRUCTIONS,
  };
  serveMcp(endpoint, () => new McpSession(info, tools))
    .on('error', (err) => console.error(`mcp: ${err.message}`));

  const win = createWindow();

  const shot = async (name: string) => {
    if (!CHECK || !shotsDir) return;
    mkdirSync(shotsDir, { recursive: true });
    const image = await win.webContents.capturePage();
    const path = join(shotsDir, `${name}.png`);
    writeFileSync(path, image.toPNG());
    console.log(`  shot ${path}`);
  };
  ipcMain.handle('check:shot', (_e, name: string) => shot(name));

  if (CHECK) {
    win.webContents.on('console-message', (event) => {
      console.log(`  [renderer] ${event.message}`);
    });
    win.webContents.on('did-fail-load', (_e, code, desc) => {
      console.log(`  [renderer] did-fail-load ${code} ${desc}`);
    });
    ipcMain.handle('check:ready',
      async (_e, report: Record<string, boolean>) => {
        const checks = { ...report };
        for (const [name, passed] of Object.entries(checks)) {
          console.log(`  ${passed ? 'ok' : 'FAIL'}  ${name}`);
        }
        const ok = Object.values(checks).every(Boolean);
        console.log(`self-test: ${ok ? 'pass' : 'FAIL'}`);
        store.flush();
        app.exit(ok ? 0 : 1);
      });
    // A client composing a council, end to end: over the socket, through
    // the tools, back to the window as a push.
    ipcMain.handle('check:mcp', () => exchange(endpoint, [
      {
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: {
          protocolVersion: '2025-06-18', capabilities: {},
          clientInfo: { name: 'strophae-check', version: '0' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      {
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: {
          name: 'compose_council',
          arguments: {
            shared_prompt: 'We are choosing a name for a bakery.',
            members: [{ persona: 'white hat' }, { persona: 'black hat' }],
          },
        },
      },
    ]));
    // Only a guard against a renderer that never reports: the walk itself
    // runs in a few seconds here, but it now drives streams and a CI runner
    // is a good deal slower, so leave it room rather than failing a green
    // build on the clock.
    setTimeout(() => {
      console.log('self-test: FAIL (renderer never reported ready)');
      app.exit(1);
    }, 30000);
  } else {
    ipcMain.handle('check:ready', () => undefined);
    ipcMain.handle('check:mcp', () => undefined);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// A second launch hands over to this one: bring its window forward.
app.on('second-instance', () => {
  if (!app.isReady()) return;
  const win = BrowserWindow.getAllWindows()[0] ?? createWindow();
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.on('window-all-closed', () => {
  store?.flush();
  if (process.platform !== 'darwin' || CHECK) app.quit();
});

app.on('before-quit', () => store?.flush());
