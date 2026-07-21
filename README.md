# strophae

Multi-persona chat. One prompt, many minds — broadcast a message to several agents at
once, each with its own model, system prompt and colour, and watch them answer in
parallel, streaming live in their own columns.

**strophae is a desktop app** for macOS and Windows built with **Electron,
Bun and React**. Real model responses stream through
[OpenRouter](https://openrouter.ai) directly from the app; your API key is
stored encrypted with the OS keychain (Electron `safeStorage`) and is only
ever sent to OpenRouter. All data lives locally in your user data folder.

## Run from source

```bash
bun install
bun run start
```

No accounts, no server. To run real models, open **Settings** and paste an
OpenRouter API key (`sk-or-…`, from [openrouter.ai/keys](https://openrouter.ai/keys)).

Useful scripts:

```bash
bun test                # unit tests (domain store, grouping, i18n)
bun run typecheck       # tsc --noEmit
bun run check           # headless smoke test (add a dir arg for screenshots)
bun run dist            # package with electron-builder (release/)
```

## Distribution

CI ([Desktop builds](.github/workflows/desktop.yml)) packages macOS
(dmg+zip) and Windows (zip) on every manual run or `v*` tag. Store
submission — **Mac App Store** (sandbox entitlements ready) and
**Microsoft Store** (appx target) — is documented in
[PACKAGING.md](PACKAGING.md).

## How it works

- **Compose** a "council" of agents (name, colour, model, system prompt) plus an
  optional shared context applied to every agent. Save agents as reusable
  **personas**.
- **Chat** broadcasts each prompt to every agent in parallel; responses stream
  independently per column, one OpenRouter request per agent.
- **Export** a session as Markdown to the clipboard.
- English and Italian interfaces, switchable live from Settings.

See [CLAUDE.md](CLAUDE.md) for architecture and developer notes.
