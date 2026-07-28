# Security policy

## Supported versions

strophae is pre-1.0 and single-maintainer: only the latest release on `main`
receives fixes.

## Reporting a vulnerability

Please **do not open a public issue.** Report privately through GitHub's
[security advisories](https://github.com/mtct/strophae/security/advisories/new),
which opens a channel visible only to the maintainer.

Include what you did, what happened, and what you expected — a minimal
reproduction is worth more than a long description. You can expect an initial
reply within a few days; because this is a spare-time project, please treat
that as a best effort rather than an SLA.

## Scope

strophae is a local-first desktop app with no backend of its own, so the
interesting surface is narrow:

- **Renderer sandbox escape** — `contextIsolation` and `sandbox` are on and
  there is no `nodeIntegration`; anything that reaches Node from the renderer
  outside the typed preload bridge (`window.strophae`) is in scope.
- **Network egress beyond openrouter.ai** — the CSP in
  `src/renderer/index.html` limits `connect-src` to the OpenRouter API.
  Anything that exfiltrates data elsewhere is in scope.
- **Injection via model output** — replies are untrusted input. Raw HTML is
  escaped (no `rehype-raw`) and mermaid runs sandboxed; a bypass of either is
  in scope, as is any path where a reply causes code execution or navigation.
- **API key handling** — the OpenRouter key is encrypted at rest via
  `safeStorage` (OS keychain) and handed to the renderer only to call
  OpenRouter. Leaks to disk, logs or any third party are in scope.
- **External link handling** — `shell:openExternal` accepts only
  http/https/mailto and the app window stays pinned to `index.html`
  (`will-navigate` is denied). Bypasses are in scope.

**Out of scope**: whatever an OpenRouter model chooses to say, the security of
your own OpenRouter account, and unsigned local builds you produce yourself.
