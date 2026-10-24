// The stdio end of the MCP server, and the command a client is configured to
// run: the app's own binary in Node mode, on this script inside it —
//
//   ELECTRON_RUN_AS_NODE=1 <Strophae binary> <app>/dist/mcp/bridge.js
//
// (Settings shows the exact lines for an install.) The protocol lives in the
// running app, next to the store it edits (src/main/mcp.ts); this only
// relays the client's stdin and stdout to the app's local socket, starting
// the app first when it is not running. Nothing but protocol may reach
// stdout, so anything it has to say itself goes to stderr.

import { spawn } from 'node:child_process';
import { connect, type Socket } from 'node:net';
import { dirname, resolve } from 'node:path';

import { mcpEndpoint } from '../main/mcp';

const endpoint = mcpEndpoint();

function dial(): Promise<Socket | null> {
  return new Promise((done) => {
    const socket = connect(endpoint);
    socket.once('connect', () => done(socket));
    socket.once('error', () => done(null));
  });
}

/** Start the app detached, the way a person would: as Electron proper,
    not Node. Returns false when there is no app to start — the script run
    by bun or node from a checkout. */
function launch(): boolean {
  if (!process.versions.electron) return false;
  // Bun inlines __dirname at bundle time; the script's own path is argv[1].
  const script = resolve(process.argv[1] ?? '');
  // Packaged, the binary knows its app; from source, Electron is handed the
  // checkout this script was built into (dist/mcp/bridge.js → ../..).
  const args = script.includes('app.asar')
    ? []
    : [resolve(dirname(script), '..', '..')];
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  spawn(process.execPath, args, { detached: true, stdio: 'ignore', env })
    .unref();
  return true;
}

async function reach(): Promise<Socket | null> {
  const open = await dial();
  if (open || !launch()) return open;
  // A cold start — Electron, the store, then the socket — takes a moment.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    const socket = await dial();
    if (socket) return socket;
  }
  return null;
}

async function main(): Promise<void> {
  const socket = await reach();
  if (!socket) {
    process.stderr.write(
      `strophae: the app is not running, or not listening at ${endpoint}\n`);
    process.exit(1);
  }
  socket.on('error', (err) => {
    process.stderr.write(`strophae: ${err.message}\n`);
    process.exit(1);
  });
  // The app closing ends the session; let stdout drain before leaving.
  socket.on('close', () => process.stdout.write('', () => process.exit(0)));
  // stdin was left paused until now, so nothing the client sent while the
  // app was starting is lost; its end ends the connection.
  process.stdin.pipe(socket);
  socket.pipe(process.stdout);
}

main();
