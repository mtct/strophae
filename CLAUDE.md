# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What strophae is

**strophae** is a multi-persona ("multi-LLM") chat desktop app for macOS and
Windows, built with **Electron + Bun + React**. One prompt is broadcast in
parallel to several agents — each with its own name, colour, model and system
prompt — and every agent answers in its own column, streaming live.

The visual identity is **Bauhaus**, shared with the landing page in `docs/`:
a warm grey board, white sheets laid on it, hard black keylines, and the
three primaries (blue `#1b34c4`, red `#cb2a17`, yellow `#f0c000`) as solid
fields. No radii, no shadows, no gradients, no tints — depth comes from
rules and weight (`--key` 1px for a control, `--frame` 2px for a sheet,
`--bar` 3px for a structural rule), the way it does in print. Each persona
owns a fat colour spine down the left edge of its sheet.

Two rules carry it. **What the chorus prints is a plain white sheet; what
you write on is marked by a solid ink bar down its left edge** (every
textarea, and the user's own turn in a thread). And **red is the one
stamped control per screen** — the action that commits it (send, start
chatting, save), so a screen never shows two; the sidebar's new-session
button is yellow for exactly this reason.

Chrome (labels, stamped controls, headings, persona names) is set lowercase
and letterspaced in a geometric sans — Futura / Avenir Next / Century
Gothic / Bahnschrift, all system faces, since the app downloads nothing —
after the Bauhaus Dessau habit the lowercase product name already asks for.
Anything a user or a model wrote keeps its own case and reads in the system
text sans. Turns are capped at a 76ch measure, so a column expanded to the
whole window still reads as a page.

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
               api.ts (typed preload bridge) · openrouter.ts (SSE streaming) ·
               theme.ts (oklch poster ink per hue — lightness *follows* the
               hue, so a yellow prints light and a blue dark instead of
               every accent flattening to mud; a column publishes it as the
               --agent custom property, and it is only ever a solid field,
               never a tint) · styles.css · index.html (CSP)
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
  all dispatched in one tick so the columns start together (only each
  model's own latency staggers them — image/audio models don't stream
  progressively, so those columns fill at the end) → `msg:finalize` writes
  each slot's full text (or `⚠ error`). The main process never calls
  OpenRouter.
- **Stream resilience** (`streamAgent`): each request carries an
  *inactivity* watchdog (`idleTimeoutMs`, default 120 s) — an `AbortController`
  rearmed on every received byte (tokens *and* OpenRouter's
  `: OPENROUTER PROCESSING` keepalives), so a genuinely dead connection
  fails as `Error('timeout')` (localised to `stream_timeout`) instead of
  hanging the column forever. A burst of personas also trips rate limits
  (429) and gateway/edge timeouts (502/503/504/524, `RETRYABLE_STATUS`);
  those are retried with exponential backoff + jitter (`maxAttempts`,
  default 3; honouring a 429 `Retry-After`), but **only before any output
  has reached the caller** — once tokens/media stream in, a mid-stream drop
  is surfaced as-is (a partial reply beats a duplicated one). A settled
  HTTP error is a `FatalError` so the connection-retry path leaves it be.
- **API key**: encrypted at rest via `safeStorage` (OS keychain),
  `packaging/openrouter.key` in userData; handed to the renderer only to
  call OpenRouter directly.
- **Security posture**: `contextIsolation` + `sandbox` on, no
  `nodeIntegration`; renderer talks only through the typed preload bridge
  (`window.strophae`); strict CSP (connect-src limited to openrouter.ai).
- **Persona library**: `store.seedPersonas()` materialises the Six Thinking
  Hats (`src/shared/personas.ts`) once per document — names/prompts
  translated at seed time in the current language, one palette hue per hat
  (white and black borrow the nearest readable hue, since an accent is a
  hue on a wheel rather than a literal colour). The Yellow Hat lands on the
  real chrome yellow now that `accentLightness` follows the hue.
  The `personasSeeded` flag makes it one-shot, so
  personas deleted via `persona:delete` never come back. Deleting a persona
  only drops the library entry — agents already created from it keep their
  own copy of the name, prompt and colour. Unlike the frozen session/agent
  defaults, the seed personas **follow the UI language**: `setLanguage`
  calls `retranslateSeedPersonas`, which re-materialises every *pristine*
  seed persona (`personaType` in `SEED_PERSONAS`, and both name and prompt
  still equal the canonical text in some `SEED_LANGS` catalog) into the new
  language — anything the user renamed/re-prompted or created themselves is
  matched by neither test and left untouched.
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

`electron-builder.yml`: mac arm64 (zip+dmg), `mas` target with sandbox
entitlements in `packaging/` (App Sandbox + JIT + network client), win x64
`nsis` installer (per-user, no UAC) + zip, `appx` target for the Microsoft
Store (identity placeholders to fill from Partner Center). Windows
cross-builds from macOS — electron-builder 26 has a native rcedit, so wine
is not needed. **One arch per platform, pinned in the config** (Apple
Silicon, Windows x64), with version-less artifact names
(`Strophae-macos-arm64.dmg`, `Strophae-windows-x64-setup.exe`) so
`releases/latest/download/<file>` is a permanent link — that is what the
download section of `docs/index.html` and the README table point at. CI
(`.github/workflows/desktop.yml`) builds both platforms with Bun on a manual
run or a `v*` tag, and a tag also publishes the binaries as the GitHub
release; the mac leg passes `-c.mac.identity=-` to **ad-hoc sign** the app,
since arm64 macOS will not launch an entirely unsigned binary and CI has no
Developer ID (a flag, not a config key, so the `mas` build still demands a
real certificate). `PACKAGING.md` documents both store flows. All npm
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

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
