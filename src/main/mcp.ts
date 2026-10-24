// A Model Context Protocol server, so a local client — Claude, LM Studio, an
// Ollama front-end — can compose the council in the running app.
//
// The app owns strophae.json (one writer, debounced), so the protocol is
// served from the main process, next to the store, on a local socket: a Unix
// domain socket in the profile folder, a named pipe on Windows. A client
// never dials it itself: it spawns the stdio bridge (src/mcp/bridge.ts),
// which relays its stdin/stdout here and starts the app when it is not
// running. One connection is one MCP session.
//
// The wire format is MCP's stdio transport — JSON-RPC 2.0, one message per
// line — written out by hand: a tools-only server is four methods, and the
// app ships no runtime dependencies.

import { chmodSync, mkdirSync, unlinkSync } from 'node:fs';
import { connect, createServer, type Server, type Socket } from 'node:net';
import { homedir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';

/** Revisions spoken here, newest first. A tools-only server reads the same
    on all of them; a client asking for another is offered the newest. */
export const PROTOCOL_VERSIONS = [
  '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05',
];

/** Where the app listens and the bridge dials. Both work it out alone, from
    the user's home — the bridge runs as plain Node, with no Electron `app`
    to ask for the profile path, and often with an environment its client
    trimmed down to HOME and PATH. */
export function mcpEndpoint(): string {
  const override = process.env.STROPHAE_MCP_ENDPOINT;
  if (override) return override;
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\strophae-mcp-${userInfo().username}`;
  }
  // Electron's userData: appData plus the package.json name, packaged or
  // run from a checkout alike.
  const base = process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support')
    : process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  const path = join(base, 'strophae', 'mcp.sock');
  // A socket path holds 104 bytes on macOS, and a sandboxed (App Store)
  // profile sits deep enough inside its container to overflow it.
  return Buffer.byteLength(path) < 104
    ? path
    : join(homedir(), '.strophae-mcp.sock');
}

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  /** The tool's work. What it returns goes back to the model as JSON text;
      what it throws, as an error result the model can read and correct. */
  run(args: Record<string, unknown>): unknown;
}

export interface McpServerInfo {
  name: string;
  title: string;
  version: string;
  /** Read by the client's model on connect: what the tools are for. */
  instructions: string;
}

type Id = string | number | null;
type Json = Record<string, unknown>;

interface Reply {
  jsonrpc: '2.0';
  id: Id;
  result?: unknown;
  error?: { code: number; message: string };
}

class RpcError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const failure = (id: Id, code: number, message: string): Reply =>
  ({ jsonrpc: '2.0', id, error: { code, message } });

/** One client's session: messages in, replies out. Pure — no I/O — so the
    tests drive it directly; `serveMcp` puts it on a socket. */
export class McpSession {
  constructor(private info: McpServerInfo, private tools: McpTool[]) {}

  /** A parsed message (or batch) in; the reply out, or null when nothing
      is owed — a notification, or a response to a request we never made. */
  handle(message: unknown): Reply | Reply[] | null {
    if (Array.isArray(message)) {
      const replies = message.map((m) => this.one(m))
        .filter((r): r is Reply => r !== null);
      return replies.length ? replies : null;
    }
    return this.one(message);
  }

  private one(message: unknown): Reply | null {
    if (!isObject(message) || message.jsonrpc !== '2.0') {
      return failure(null, -32600, 'Invalid request');
    }
    if (typeof message.method !== 'string') {
      // A client's answer to a server request: none are ever sent.
      if ('result' in message || 'error' in message) return null;
      return failure(this.idOf(message), -32600, 'Invalid request');
    }
    if (!('id' in message)) return null; // a notification: nothing to say
    const id = this.idOf(message);
    try {
      const params = isObject(message.params) ? message.params : {};
      return { jsonrpc: '2.0', id, result: this.dispatch(message.method, params) };
    } catch (err) {
      return err instanceof RpcError
        ? failure(id, err.code, err.message)
        : failure(id, -32603, err instanceof Error ? err.message : String(err));
    }
  }

  private idOf(message: Json): Id {
    const id = message.id;
    return typeof id === 'string' || typeof id === 'number' ? id : null;
  }

  private dispatch(method: string, params: Json): unknown {
    switch (method) {
      case 'initialize': {
        const asked = params.protocolVersion;
        const { instructions, ...serverInfo } = this.info;
        return {
          protocolVersion: typeof asked === 'string'
            && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo,
          instructions,
        };
      }
      case 'ping':
        return {};
      case 'tools/list':
        return { tools: this.tools.map(({ run: _run, ...tool }) => tool) };
      case 'tools/call':
        return this.call(params);
      default:
        throw new RpcError(-32601, `Method not found: ${method}`);
    }
  }

  private call(params: Json): unknown {
    const tool = this.tools.find((t) => t.name === params.name);
    if (!tool) throw new RpcError(-32602, `Unknown tool: ${String(params.name)}`);
    const args = isObject(params.arguments) ? params.arguments : {};
    try {
      const result = tool.run(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text }], isError: true };
    }
  }
}

// A message is one line; anything this long is not a message.
const MAX_LINE = 8 * 1024 * 1024;

/** Feed a socket's chunks in, get its complete lines out. */
function lineReader(socket: Socket, onLine: (line: string) => void): void {
  let pending = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => {
    pending += chunk;
    let nl: number;
    while ((nl = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, nl).trim();
      pending = pending.slice(nl + 1);
      if (line) onLine(line);
    }
    if (pending.length > MAX_LINE) socket.destroy();
  });
}

/** Serve a fresh session per connection on `endpoint`. */
export function serveMcp(endpoint: string,
                         session: () => McpSession): Server {
  const pipe = process.platform === 'win32';
  if (!pipe) {
    mkdirSync(dirname(endpoint), { recursive: true });
    // One app per profile (the single-instance lock in main.ts), so a socket
    // file already there was left by one that died: clear it.
    try {
      unlinkSync(endpoint);
    } catch { /* none left */ }
  }
  const server = createServer((socket) => {
    const mcp = session();
    socket.on('error', () => socket.destroy());
    const send = (reply: unknown) => {
      if (!socket.destroyed) socket.write(`${JSON.stringify(reply)}\n`);
    };
    lineReader(socket, (line) => {
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        return send(failure(null, -32700, 'Parse error'));
      }
      const reply = mcp.handle(message);
      if (reply !== null) send(reply);
    });
  });
  server.listen(endpoint, () => {
    // The person's own account only, like the profile folder around it.
    if (!pipe) chmodSync(endpoint, 0o600);
  });
  return server;
}

/** Send `messages` down one connection and resolve with the replies to the
    ones carrying an id — a minimal client, for the self-test. */
export function exchange(endpoint: string,
                         messages: Json[]): Promise<unknown[]> {
  const owed = messages.filter((m) => 'id' in m).length;
  return new Promise((resolve, reject) => {
    const socket = connect(endpoint);
    const replies: unknown[] = [];
    socket.on('error', reject);
    socket.on('connect', () => {
      for (const m of messages) socket.write(`${JSON.stringify(m)}\n`);
    });
    lineReader(socket, (line) => {
      replies.push(JSON.parse(line));
      if (replies.length === owed) {
        socket.end();
        resolve(replies);
      }
    });
  });
}
