# strophae

[![CI](https://github.com/mtct/strophae/actions/workflows/ci.yml/badge.svg)](https://github.com/mtct/strophae/actions/workflows/ci.yml)
[![Desktop builds](https://github.com/mtct/strophae/actions/workflows/desktop.yml/badge.svg)](https://github.com/mtct/strophae/actions/workflows/desktop.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-buy%20me%20a%20coffee-ff5e5b.svg?logo=ko-fi&logoColor=white)](https://ko-fi.com/mtct)
[![Sponsor](https://img.shields.io/badge/sponsor-GitHub-ea4aaa.svg?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/mtct)

Multi-persona chat. One prompt, many minds — broadcast a message to several agents at
once, each with its own model, system prompt and colour, and watch them answer in
parallel, streaming live in their own columns.

**strophae is a desktop app** for macOS and Windows built with **Electron,
Bun and React**. Real model responses stream through
[OpenRouter](https://openrouter.ai) directly from the app — or from models you
run yourself with [Ollama](https://ollama.com), LM Studio or llama.cpp, with no
key and no account. Your OpenRouter key is stored encrypted with the OS
keychain (Electron `safeStorage`) and is only ever sent to OpenRouter. All
data lives locally in your user data folder.

→ [Project page](https://mtct.github.io/strophae/)

## Download

| | |
| --- | --- |
| **macOS** (Apple Silicon) | [Strophae-macos-arm64.dmg](https://github.com/mtct/strophae/releases/latest/download/Strophae-macos-arm64.dmg) · [.zip](https://github.com/mtct/strophae/releases/latest/download/Strophae-macos-arm64.zip) |
| **Windows** (x64) | [Strophae-windows-x64-setup.exe](https://github.com/mtct/strophae/releases/latest/download/Strophae-windows-x64-setup.exe) · [.zip](https://github.com/mtct/strophae/releases/latest/download/Strophae-windows-x64.zip) |

Both come out of [CI](.github/workflows/desktop.yml) on every version tag; all
of them are on the [releases page](https://github.com/mtct/strophae/releases).
Neither is signed with a paid certificate, so the first launch takes one extra
step: on macOS right-click the app → **Open** (or `xattr -dr
com.apple.quarantine /Applications/Strophae.app`), on Windows click **More
info** → **Run anyway**.

## Run from source

```bash
bun install
bun run start
```

No accounts, no server. To run real models, open **Settings** and paste an
OpenRouter API key (`sk-or-…`, from [openrouter.ai/keys](https://openrouter.ai/keys)),
or [use local models](#local-models) instead.

Useful scripts:

```bash
bun test                # unit tests (domain store, grouping, i18n)
bun run typecheck       # tsc --noEmit
bun run check           # headless smoke test (add a dir arg for screenshots)
bun run dist            # package with electron-builder (release/)
```

## How it works

- **Compose** a "council" of agents (name, colour, model, system prompt) plus an
  optional shared context applied to every agent. Save agents as reusable
  **personas** — the Six Thinking Hats ship as a starter library.
- **Chat** broadcasts each prompt to every agent in parallel; responses stream
  independently per column, one request per agent — to OpenRouter, or to your
  own local model server. A council can mix both.
- **Rich replies**: markdown with tables and task lists, ` ```mermaid ` fences
  rendered as diagrams, plus image and audio output for models that support it.
- **Attachments**: doc/docx/pdf/md/txt/csv and images, attached to the shared
  prompt, to a single agent, or to any message.
- **Export** a session as Markdown to the clipboard.
- English and Italian interfaces, switchable live from Settings.

## Local models

Any OpenAI-compatible server on your computer or your own network can stand in
for OpenRouter: [Ollama](https://ollama.com), LM Studio, llama.cpp's
`llama-server`, vLLM.

1. Start the server and get a model — with Ollama, `ollama pull qwen3:8b`.
2. In **Settings → Local server**, check the address (Ollama's
   `http://localhost:11434/v1` is filled in; LM Studio is
   `http://localhost:1234/v1`) and press **Find models**.
3. Add the models you want with **+** — they join the model list marked
   *local* — and save.
4. Give an agent a local model in the compose page, as you would any other.

A council made only of local models needs no API key at all, and what you send
those models never leaves your network. Local models answer in text (they read
images too, if the model can); a PDF attached to their prompt is skipped with a
note to the model, since these servers take no file parts. Several local agents
share one machine, so they answer in turn rather than all at once — Ollama's
`OLLAMA_NUM_PARALLEL` and `OLLAMA_MAX_LOADED_MODELS` decide how many at a time.

## Compose from an MCP client

strophae is also a [Model Context Protocol](https://modelcontextprotocol.io)
server, so a local client — Claude Desktop, Claude Code, LM Studio, an Ollama
front-end with MCP support — can set up the council for you: *"put the black
and green hats and a skeptical accountant on it, shared context: we are
pricing a new product"*. The client's model gets these tools:

| Tool | What it does |
| --- | --- |
| `list_personas`, `list_models` | read the persona library and the configured models |
| `create_persona`, `update_persona` | add a persona to the library, or edit one |
| `compose_council` | lay out the whole council: library personas (with optional overrides) and one-off voices, plus the shared prompt |
| `set_shared_prompt`, `add_member`, `update_member`, `remove_member` | refine it piece by piece |
| `get_council` | read back what is on the table |

The council appears on the compose page as it is built; you review it there
and press **start chatting** yourself — no tool sends a prompt, reads your
conversations or touches your API key.

**Settings → MCP clients** shows the exact lines for your install, with a
copy button. On macOS they look like this:

```json
{
  "mcpServers": {
    "strophae": {
      "command": "/Applications/Strophae.app/Contents/MacOS/Strophae",
      "args": ["/Applications/Strophae.app/Contents/Resources/app.asar/dist/mcp/bridge.js"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

With Claude Code: `claude mcp add strophae -e ELECTRON_RUN_AS_NODE=1 --
<command> <args>` with the same two paths. The client runs the app's own
binary as plain Node on a small bridge script, which relays to the running app
over a local socket — and starts strophae first when it is not open.

## Privacy

Everything is local. There is no strophae server, no telemetry and no account
— the app's only network egress is the OpenRouter API, enforced by the
renderer's Content Security Policy, plus the local model server you set in
Settings, which the app accepts only on your computer or your private network.
Your conversations live in a single JSON
document in your OS user-data folder, and your API key is encrypted at rest by
the OS keychain. The MCP endpoint is not a network listener: it is a local
socket under your own user account (a named pipe on Windows), reachable only by
programs you run.

## Distribution

CI ([Desktop builds](.github/workflows/desktop.yml)) packages macOS arm64
(dmg+zip) and Windows x64 (setup.exe + zip) on every manual run or `v*` tag,
and a `v*` tag publishes them as a GitHub release. Store submission —
**Mac App Store** (sandbox entitlements ready) and **Microsoft Store** (appx
target) — is documented in [PACKAGING.md](PACKAGING.md).

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md)
for the setup, the checks to run, and the handful of constraints worth knowing
about (zero runtime dependencies, sandboxed renderer, i18n key parity).
Architecture and developer notes live in [CLAUDE.md](CLAUDE.md); security
reports go through [SECURITY.md](SECURITY.md), not the public issue tracker.

## Support

strophae is free, MIT-licensed and built by one person in the open. If it saves
you a stack of chat tabs, a donation helps keep the columns streaming — and the
store releases coming:

- ☕ [Buy me a coffee on Ko-fi](https://ko-fi.com/mtct) — one-off, no account needed
- ❤️ [Sponsor on GitHub](https://github.com/sponsors/mtct) — monthly or one-off

Starring the repo and filing good bug reports help just as much, and are free.

## Licence

[MIT](LICENSE) © Matteo Costa
