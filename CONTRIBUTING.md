# Contributing to strophae

Thanks for taking an interest. strophae is a small, single-maintainer
project — issues and pull requests are welcome, and the fastest way to get a
change merged is to keep it focused and to run the checks below first.

## Getting set up

You need [Bun](https://bun.sh) (the package manager, bundler *and* test
runner — there is no npm/webpack step) and a machine that can run Electron.

```bash
bun install       # Electron's binary download is a trusted postinstall
bun run start     # bundles with Bun.build, then launches Electron
```

The app works without any credentials, but to get real replies open
**Settings** and paste an OpenRouter API key (`sk-or-…`, from
[openrouter.ai/keys](https://openrouter.ai/keys)). The key is encrypted at
rest with the OS keychain (Electron `safeStorage`) and is only ever sent to
openrouter.ai.

## Before you open a pull request

Run all three. CI runs the same ones on every push and PR.

```bash
bun run typecheck   # tsc --noEmit
bun test            # unit suites under tests/
bun run check       # headless smoke test: boots the app, walks compose → chat
```

`bun run check [shots-dir]` accepts an optional directory and will save PNG
screenshots there — handy when your change is visual.

## Things worth knowing

- **Architecture notes live in [CLAUDE.md](CLAUDE.md)** — the domain model,
  the send/stream flow, persistence rules and the security posture. Read the
  relevant section before changing behaviour; it will save you a round trip.
- **Runtime dependencies are deliberately zero.** Every npm package is a
  `devDependency`; the shipped app is the Bun-built `dist/` bundle plus
  `package.json`, so electron-builder packages no `node_modules`. If a change
  needs a new library, say so in the PR description — it is a real decision,
  not a detail.
- **The renderer is sandboxed.** `contextIsolation` and `sandbox` are on,
  there is no `nodeIntegration`, and the renderer reaches the main process
  only through the typed preload bridge (`window.strophae`). The CSP in
  `src/renderer/index.html` limits `connect-src` to openrouter.ai — the app
  has no other network egress, and it should stay that way.
- **Model output is untrusted.** Markdown is rendered without `rehype-raw`,
  so raw HTML in a reply is escaped rather than parsed; mermaid runs with
  `securityLevel: strict`, `htmlLabels` off and a DOMPurify pass. Please
  don't loosen either.
- **i18n**: user-facing product strings go in `src/shared/i18n.ts`, in both
  the `en` and `it` catalogs — a test enforces key parity, so a missing
  translation fails the build. User content and model replies are never
  translated.
- **`Bun.build` inlines `__dirname` to the *source* directory**, so
  main-process paths must resolve through `app.getAppPath()` (see
  `src/main/main.ts`).
- **On some setups `ELECTRON_RUN_AS_NODE=1` is exported** (notably inside
  editor extension hosts), which turns the Electron binary into plain Node.
  The `start` and `check` scripts clear it; if you launch Electron by hand,
  use `env -u ELECTRON_RUN_AS_NODE …`.

## Style

Match the surrounding code — same naming, same comment density, plain CSS
(no Tailwind, no CDN). There is no linter to argue with you; the existing
files are the reference.

## Reporting bugs and proposing features

Use the [issue templates](https://github.com/mtct/strophae/issues/new/choose).
For anything security-related, follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.

By contributing you agree that your work is licensed under the
[MIT License](LICENSE).
