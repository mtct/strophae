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
[OpenRouter](https://openrouter.ai) directly from the app; your API key is
stored encrypted with the OS keychain (Electron `safeStorage`) and is only
ever sent to OpenRouter. All data lives locally in your user data folder.

→ [Project page](https://mtct.github.io/strophae/)

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

## How it works

- **Compose** a "council" of agents (name, colour, model, system prompt) plus an
  optional shared context applied to every agent. Save agents as reusable
  **personas** — the Six Thinking Hats ship as a starter library.
- **Chat** broadcasts each prompt to every agent in parallel; responses stream
  independently per column, one OpenRouter request per agent.
- **Rich replies**: markdown with tables and task lists, ` ```mermaid ` fences
  rendered as diagrams, plus image and audio output for models that support it.
- **Attachments**: doc/docx/pdf/md/txt/csv and images, attached to the shared
  prompt, to a single agent, or to any message.
- **Export** a session as Markdown to the clipboard.
- English and Italian interfaces, switchable live from Settings.

## Privacy

Everything is local. There is no strophae server, no telemetry and no account
— the app's only network egress is the OpenRouter API, enforced by the
renderer's Content Security Policy. Your conversations live in a single JSON
document in your OS user-data folder, and your API key is encrypted at rest by
the OS keychain.

## Distribution

CI ([Desktop builds](.github/workflows/desktop.yml)) packages macOS
(dmg+zip) and Windows (zip) on every manual run or `v*` tag. Store
submission — **Mac App Store** (sandbox entitlements ready) and
**Microsoft Store** (appx target) — is documented in
[PACKAGING.md](PACKAGING.md).

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
