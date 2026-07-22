<!--
SYNC IMPACT REPORT
==================
Version change: 1.1.0 → 2.0.0
Bump rationale: The application was rebuilt as an Electron + Bun + React
  desktop client (commit f4d2bba); the Django/Python web stack the previous
  constitution mandated no longer exists in this repository. Every
  stack-bound principle is redefined for the new configuration, the ruff
  formatting principle is removed (no equivalent tool is configured), and
  two new principles capture what now governs the product: the security
  posture of the sandboxed desktop app (established by the 2026-07-22
  security audit) and its self-contained, store-distributable packaging.
  Backward-incompatible redefinition and removal of principles → MAJOR.

Modified principles:
  - I. Simplicity & Linearity (FBV-First) → I. Simplicity & Linearity (YAGNI)
  - II. Test-First Coverage (pytest) → II. Test-First Coverage
    (bun test + Electron self-test)
  - III. Static Type Safety (mypy + django-stubs) → III. Static Type Safety
    (strict TypeScript)
  - V. Agent-Centric Architecture — intent unchanged, wording adapted to the
    desktop client (parallel streaming columns)

Added sections:
  - IV. Security & Privacy by Default (new principle)
  - VI. Self-Contained & Store-Distributable (new principle)

Removed sections:
  - IV. Consistent Formatting & Linting (ruff) — no automated formatter is
    configured in the Electron era; style discipline is now a review
    expectation under Development Workflow & Quality Gates.

Templates requiring updates:
  - .specify/templates/tasks-template.md ✅ updated (pytest → bun test in the
    mandatory tests note)
  - .specify/templates/plan-template.md ✅ reviewed (Constitution Check gate
    is generic and reads this file; example strings are illustrative — no
    edit required)
  - .specify/templates/spec-template.md ✅ reviewed (no change required)
  - .specify/templates/checklist-template.md ✅ reviewed (no change required)

Follow-up TODOs: none
-->

# strophae Constitution

## Core Principles

### I. Simplicity & Linearity (YAGNI)

Code MUST be simple, linear, and easy to read top-to-bottom. Apply YAGNI: do
not add abstraction, indirection, or configurability that no current
requirement needs. Prefer plain functions and explicit, straight-line control
flow over clever or implicit constructs. Domain rules live in `src/shared/`
and the main-process store; React components stay presentational and talk to
the data layer only through the typed bridge.

**Rationale**: A multi-persona chat system is inherently complex in its
domain; keeping the surrounding code boring and linear keeps that complexity
legible and reviewable, and lowers the cost of onboarding and change.

### II. Test-First Coverage (bun test + Electron self-test)

Every domain behavior MUST be covered by unit tests written with `bun test`.
No feature is considered complete until its tests exist and pass. Tests MUST
be runnable in isolation, MUST NOT depend on external network services, and
MUST NOT read or write a real user profile. Bug fixes MUST add a regression
test that fails before the fix and passes after. The Electron smoke test
(`bun run check`) MUST keep passing: it boots the app offscreen against a
throwaway `userData` profile and walks compose → chat, and it is the gate
that proves the packaged app still assembles into a working product.

**Rationale**: Agents transform user input into streamed responses; without
enforced tests, silent regressions in domain rules and app assembly are
invisible until a store build ships them.

### III. Static Type Safety (strict TypeScript)

All code — main, preload, renderer, shared, scripts, and tests — MUST be
TypeScript compiled under `strict: true`, and `bun run typecheck`
(`tsc --noEmit`) MUST pass with zero errors before code is merged. The
renderer/main boundary MUST stay typed end-to-end: every IPC channel is
exposed to the renderer only through the typed preload bridge
(`window.strophae`), never via raw `ipcRenderer` access. Escape hatches
(`any`, `@ts-expect-error`, `@ts-ignore`) MUST be justified by a comment
naming the constraint that forces them.

**Rationale**: The process boundary is where a desktop app breaks silently;
a typed bridge catches integration bugs at edit time rather than at runtime
on a user's machine.

### IV. Security & Privacy by Default

The app handles untrusted LLM output, user files, and an API secret; its
security posture is constitutional, not incidental:

- The renderer MUST run sandboxed: `contextIsolation` and `sandbox` on,
  `nodeIntegration` off. Its only bridge to the system is the typed preload
  API; it MUST NOT be able to open windows, navigate away from the bundled
  `index.html`, or obtain Chromium permissions beyond what a shipped feature
  requires.
- The renderer CSP MUST stay strict. The only network egress of the entire
  application is the OpenRouter API, called from the renderer; the main
  process performs no network I/O.
- Secrets MUST be encrypted at rest with `safeStorage` (OS keychain), MUST
  never be written or logged in plaintext, and MUST be sent nowhere but
  OpenRouter.
- LLM output is untrusted input: it MUST be rendered as text (React text
  nodes), never as raw HTML; generated SVG (mermaid) MUST pass sanitization
  (securityLevel strict, htmlLabels off, DOMPurify) before touching the DOM.
- The renderer MUST NOT supply filesystem paths: files enter only via the
  native dialog and are resolved by coerced numeric id inside the app's own
  attachments directory.
- Electron MUST stay on a security-supported major version and `bun audit`
  MUST be clean before a release and whenever dependencies change.
- Diagnostics, tests, and the self-test MUST NOT print secrets or real user
  content.

**Rationale**: A chat client is a lens on private conversations plus a paid
API credential; every rule above removes a class of exfiltration or
code-execution risk identified in the 2026-07-22 security audit.

### V. Agent-Centric Architecture

The domain MUST be modeled around independent agents. Each agent owns its
name, colour, model, and system prompt; one prompt is broadcast to every
agent in the conversation, and each agent streams its answer independently
in its own column. One agent's processing MUST NOT depend on another agent's
output. Adding, removing, or reconfiguring an agent MUST NOT require changes
to unrelated agents or to the message-dispatch flow.

**Rationale**: The core product is a multi-persona chat where separate
agents answer the same prompt differently; isolating agents keeps personas
composable and independently testable.

### VI. Self-Contained & Store-Distributable

The app MUST remain fully self-contained: no CDN or remote assets — every
dependency is bundled by Bun into `dist/`, all npm packages are
devDependencies, and the packaged app ships `dist/` only. Persistence is
local: one JSON document plus flat attachment files in Electron `userData`,
written atomically; no external database or server component exists. The
product is single-user by design. Packaging MUST remain acceptable to the
Mac App Store sandbox and the Microsoft Store, with entitlements limited to
App Sandbox, JIT, and network client.

**Rationale**: Store distribution is the delivery channel; self-containment
is both what the store sandboxes require and what keeps the app's attack
surface and failure modes small.

## Technology Stack

The following stack is normative. Substitutions require a constitution
amendment.

- **Runtime host**: Electron — main process as data layer, sandboxed
  renderer as UI — kept on a security-supported major version.
- **Tooling**: Bun as package manager, bundler (`Bun.build`), and test
  runner.
- **Language**: TypeScript under `strict: true` for all code.
- **UI**: React 19 with plain CSS (no Tailwind, no CSS-in-JS, no CDN).
- **LLM access**: the OpenRouter chat/completions API, streamed directly
  from the renderer; the model list is user-configurable in Settings.
- **Persistence**: single JSON document (`strophae.json`) + attachment
  payload files in `userData`, atomic tmp+rename writes.
- **i18n**: English source + Italian catalog in `src/shared/i18n.ts`; key
  parity is enforced by tests; only product UI text is translated — user
  content and LLM replies never are.
- **Packaging**: electron-builder — mac zip/dmg and MAS pkg, win zip and
  appx.

## Development Workflow & Quality Gates

Before any change is merged, all of the following gates MUST pass:

1. `bun run typecheck` passes with zero errors.
2. The full `bun test` suite passes, including tests for the new or changed
   behavior.
3. The Electron self-test (`bun run check`) passes.
4. `bun audit` reports no known vulnerabilities whenever dependencies
   change, and always before a release.

No automated formatter is configured: new code MUST match the style, naming,
and idiom of the surrounding code, and review enforces that consistency.
Pull requests MUST be reviewed for compliance with the Core Principles, in
particular the security posture (Principle IV) and the agent-isolation rule
(Principle V). Any deviation from a principle MUST be justified in writing
in the PR description, or the PR MUST be changed to comply.

## Governance

This constitution supersedes all other development practices for the
strophae project. When guidance conflicts, the constitution wins.

Amendments MUST be proposed as a change to this file, MUST include an
updated Sync Impact Report, and MUST be reviewed and approved before merge.
Versioning follows semantic versioning:

- **MAJOR**: Backward-incompatible removal or redefinition of a principle or
  governance rule.
- **MINOR**: A new principle or section is added, or existing guidance is
  materially expanded.
- **PATCH**: Clarifications, wording, or non-semantic refinements.

All PRs and reviews MUST verify compliance with the principles and quality
gates defined here. Complexity that violates a principle MUST be justified
in the Complexity Tracking section of the relevant plan, or removed.
Project-level agent guidance for day-to-day development is recorded in
`CLAUDE.md`.

**Version**: 2.0.0 | **Ratified**: 2026-06-28 | **Last Amended**: 2026-07-22
