// Strophae — Electron main process.
//
// `electron . --check [shots-dir]` runs the headless smoke test: boot the
// app offscreen, wait for the renderer's readiness report, optionally save
// screenshots, exit 0/1. Mirrors the verification mode of the previous
// native builds.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { app, BrowserWindow, ipcMain } from 'electron';

import { registerIpc } from './ipc';
import { Store } from './store';

const CHECK = process.argv.includes('--check');
const shotsDir = CHECK
  ? process.argv[process.argv.indexOf('--check') + 1]
  : undefined;

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
    backgroundColor: '#f7f7f8',
    webPreferences: {
      // Bun inlines __dirname to the *source* dir at bundle time, so paths
      // must go through the app root instead.
      preload: join(app.getAppPath(), 'dist/preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile('dist/renderer/index.html',
    CHECK ? { query: { check: '1' } } : undefined);
  return win;
}

app.whenReady().then(() => {
  const dir = app.getPath('userData');
  store = new Store(dir, osLanguage());
  registerIpc(store, dir, osLanguage());

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
    setTimeout(() => {
      console.log('self-test: FAIL (renderer never reported ready)');
      app.exit(1);
    }, 15000);
  } else {
    ipcMain.handle('check:ready', () => undefined);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  store?.flush();
  if (process.platform !== 'darwin' || CHECK) app.quit();
});

app.on('before-quit', () => store?.flush());
