# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What strophae is

**strophae** is a multi-persona ("multi-LLM") chat desktop app for macOS and
Windows, built with **Electron + Bun + React**. One prompt is broadcast in
parallel to several agents — each with its own name, colour, model and system
prompt — and every agent answers in its own column, streaming live. The
visual identity comes from a `claude.ai/design` prototype.

## Stack & commands

**Bun** is the package manager, bundler (`Bun.build`) and test runner;
**Electron** hosts the app (main process = data layer, sandboxed renderer =
React UI); **React 19** + plain CSS (no Tailwind, no CDN — the app is fully
self-contained; the only network egress is the OpenRouter API, enforced by
the renderer CSP in `src/renderer/index.html`).

- Install: `bun install` (Electron's binary download is a trusted
  postinstall — see `trustedDependencies` in package.json).
- Run: `bun run start`
- Smoke test: `bun run check [shots-dir]` — boots offscreen, walks
  compose→chat, reports readiness checks, optionally saves PNG screenshots
  (read them to review visuals). CI runs this headless.
- Tests: `bun test` (tests/ — domain store, recency grouping, i18n
  catalogs). Typecheck: `bun run typecheck`.
- Package: `bun run dist` (electron-builder → `release/`); quick unpacked
  build: `bunx electron-builder --dir`.
- **Environment gotcha**: this workspace (VSCode extension host) exports
  `ELECTRON_RUN_AS_NODE=1`, which turns the Electron binary into plain
  Node. Launch with `env -u ELECTRON_RUN_AS_NODE …` in terminals here (the
  `check` npm script and CI set it empty explicitly).
- **Bun gotcha**: `Bun.build` inlines `__dirname` to the *source* dir —
  main-process paths must go through `app.getAppPath()` (see
  `src/main/main.ts`).

## Architecture

```text
src/shared/    types.ts (domain model, Modality) · models.ts (DEFAULT_MODELS
               seed, modelSlug(label, models), supportsImageOutput/
               supportsAudioOutput, defaultModality, HUE_PALETTE, default
               agent, title rules) · personas.ts (SIX_HATS seed library) ·
               fences.ts (```mermaid block parser) · audio.ts (streamed
               PCM16 → WAV data URL) · time.ts (sidebar recency buckets) ·
               i18n.ts (en/it catalogs, translate())
src/main/      main.ts (window, --check mode) · store.ts (persistence) ·
               ipc.ts (IPC surface + safeStorage API key) · attachments.ts
               (file import/extraction + payload files + GC)
src/preload/   preload.ts (contextBridge → window.strophae)
src/renderer/  React app: App.tsx (state, view routing, toasts) ·
               components/ (Sidebar, ComposePage, ChatPage, SettingsModal) ·
               openrouter.ts (SSE streaming) · theme.ts (oklch accents) ·
               styles.css · index.html (CSP)
scripts/       bundle.ts (Bun.build for main/preload/renderer + static copy)
tests/         bun test suites for src/shared (audio, models, fences,
               i18n, time) + src/main (store, attachments)
packaging/     icons + Mac App Store entitlements (electron-builder
               buildResources)
```

- **Persistence** (`store.ts`): one JSON document (`strophae.json`) in
  Electron `userData`, atomic tmp+rename writes, debounced; `flush()` on
  quit. Domain rules ported from the Django era: a *draft* is a
  conversation whose agents have zero messages (hidden from the sidebar,
  reused by `getOrCreateDraft`); titles come from the first prompt
  (46-char cut); `nextHue` walks `HUE_PALETTE`.
- **Send flow** (ChatPage): `msg:send` persists the user message + an empty
  assistant slot per agent and returns slot ids → renderer fires one
  OpenRouter stream per agent (fetch SSE, `src/renderer/openrouter.ts`),
  accumulating into `live` state → `msg:finalize` writes each slot's full
  text (or `⚠ error`). The main process never calls OpenRouter.
- **API key**: encrypted at rest via `safeStorage` (OS keychain),
  `packaging/openrouter.key` in userData; handed to the renderer only to
  call OpenRouter directly.
- **Security posture**: `contextIsolation` + `sandbox` on, no
  `nodeIntegration`; renderer talks only through the typed preload bridge
  (`window.strophae`); strict CSP (connect-src limited to openrouter.ai).
- **Persona library**: `store.seedPersonas()` materialises the Six Thinking
  Hats (`src/shared/personas.ts`) once per document — names/prompts
  translated at seed time then frozen like any other product default, one
  palette hue per hat (white and black borrow the nearest readable hue,
  since accents are fixed-lightness oklch). The `personasSeeded` flag makes
  it one-shot, so personas deleted via `persona:delete` never come back.
  Deleting a persona only drops the library entry — agents already created
  from it keep their own copy of the name, prompt and colour.
- **Models are user-configurable**: `Settings.models` (label + OpenRouter
  string) is seeded from `DEFAULT_MODELS` and edited in the Settings modal
  (add/remove; at least one entry, `settings:setModels`). Slug resolution
  at request time: configured list → seed defaults → the label itself, so
  agents referencing a removed model keep working and a raw OpenRouter
  string works as a label.
- **Rich assistant replies**: replies render as **markdown**
  (`components/Markdown.tsx` — react-markdown + remark-gfm for
  tables/task-lists/strikethrough + remark-breaks so single newlines stay
  line breaks like the old plain-text look). No `rehype-raw`: raw HTML in
  the untrusted model output is escaped, never parsed, so there is no
  injection surface. Links open in the OS browser via a new
  `shell:openExternal` IPC (main-side scheme check: only http/https/mailto;
  the app window itself stays pinned to index.html, `will-navigate` denied).
  ```mermaid fences still render as diagrams (`components/Mermaid.tsx` —
  mermaid bundled by Bun, securityLevel strict + htmlLabels off + DOMPurify
  pass; unterminated fences stay raw text while streaming, parser in
  `src/shared/fences.ts`); `AssistantBody` splits mermaid out first, then
  renders the surrounding text segments as markdown.
- **Per-persona modality** (`Agent.modality`/`Persona.modality`:
  `'text' | 'image' | 'audio'`, chosen in the compose card's Output
  selector): drives the OpenRouter `modalities` request field and how the
  reply is rendered/persisted, replacing the old slug-only image guess
  (`defaultModality(slug)` now only seeds the default at creation; legacy
  documents are backfilled from the slug in `store.load()`). Image agents:
  `modalities:["image","text"]`, streamed `delta.images` data URLs display
  live and persist as image attachments (`importDataUrl` → `StoredImage`).
  Audio agents: `modalities:["audio","text"]` + `audio:{voice,format:pcm16}`,
  the streamed `delta.audio` transcript shows live as text while the base64
  PCM16 chunks are assembled into one WAV (`src/shared/audio.ts`) at
  finalize, persisted as an audio attachment and played via `StoredAudio`
  (`media-src data:` in the CSP). `msg:finalize` takes generic `media`
  data URLs (image or audio); `importDataUrl` picks the kind from the mime.
- **i18n**: en source + it catalog in `src/shared/i18n.ts` (tests enforce
  key parity). Language preference `'' | en | it` ('' = follow OS,
  `app.getLocale()`); switching from Settings re-renders live. Only product
  UI text is translated — user content and LLM replies never are;
  product-created defaults (Simple Jack, "Agent N", session titles) are
  materialised once in the current language at creation and then frozen.
- **--check mode** (`main.ts` + `App.tsx` `runSelfTest`): loads the app
  offscreen with `?check=1`, renderer walks the screens and reports
  `{check: bool}` via `check:ready`; `check:shot` captures PNGs. 15s
  timeout guards a hung renderer.

## Packaging & stores

`electron-builder.yml`: mac (zip+dmg), `mas` target with sandbox
entitlements in `packaging/` (App Sandbox + JIT + network client), win zip,
`appx` target for the Microsoft Store (identity placeholders to fill from
Partner Center). `PACKAGING.md` documents both store flows; CI
(`.github/workflows/desktop.yml`) builds both platforms with Bun. All npm
packages are devDependencies — the runtime bundle is `dist/` only, so
electron-builder packages no node_modules.

## Known scope notes

- Single-user by design; the web era's workspace features (members, roles,
  invites) have no equivalent here.
- **Attachments**: doc/docx/pdf/md/txt/csv + png/jpg can be attached to the
  shared prompt (`Conversation.attachments`), a single agent's prompt
  (`Agent.attachments`) and chat messages (`Message.attachments`). Files are
  picked via `att:pick` (native dialog, ≤20 MB), imported into
  `userData/attachments/` by `src/main/attachments.ts` — doc/docx reduced to
  text with `word-extractor` (devDependency, bundled into dist/main), other
  documents stored as UTF-8, images/PDF as raw bytes. At request time the
  renderer (`src/renderer/attachments.ts`) inlines text docs into the
  system/user text and sends images (`image_url`) and PDFs (`file` part) as
  base64 data URLs to OpenRouter. Payload files are reference-counted:
  detach/clear/delete GC them (`store.gcAttachments`), plus an orphan sweep
  at startup. Generated images can be downloaded to a local folder: the
  `StoredImage` overlay button calls `att:save`, which pops a native
  `showSaveDialog` and copies the stored payload file to the chosen path
  (`copyAttachmentTo` in `src/main/attachments.ts`).
