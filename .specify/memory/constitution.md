<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0
Bump rationale: Substituted the mandated static type checker from `ty` to
  `mypy` with `django-stubs`. `ty` (v0.0.55) has no Django ORM support and
  reported dozens of false positives on managers, reverse relations, primary
  keys and field descriptors; `mypy` + `django-stubs` understands the ORM and
  type-checks the codebase to zero errors. Principle III (static type safety)
  is unchanged in intent; only its tool is redefined — a MINOR amendment per
  the Technology Stack's "substitutions require an amendment" rule.

Modified principles:
  - III. Static Type Safety (ty) → III. Static Type Safety (mypy + django-stubs)

Added sections: none

Removed sections: none

Templates requiring updates:
  - .specify/templates/plan-template.md ✅ reviewed (Constitution Check gate is
    generic and references this file; no edit required)
  - .specify/templates/spec-template.md ✅ reviewed (no change required)
  - .specify/templates/tasks-template.md ✅ reviewed (references pytest, not the
    type checker; no edit required)
  - .specify/templates/checklist-template.md ✅ reviewed (no change required)

Follow-up TODOs: none
-->

# strophae Constitution

## Core Principles

### I. Simplicity & Linearity (FBV-First)

Code MUST be simple, linear, and easy to read top-to-bottom. The Django HTTP
layer MUST use Function-Based Views (FBV); Class-Based Views are NOT permitted.
Apply YAGNI: do not add abstraction, indirection, or configurability that no
current requirement needs. Prefer explicit, straight-line control flow over
clever or implicit constructs.

**Rationale**: A multi-persona chat system is inherently complex in its domain;
keeping the surrounding code boring and linear keeps that complexity legible and
reviewable, and lowers the cost of onboarding and change.

### II. Test-First Coverage (pytest)

Every behavior MUST be covered by unit tests written with `pytest`. No feature
is considered complete until its tests exist and pass. Tests MUST be runnable in
isolation and MUST not depend on external network services. Bug fixes MUST add a
regression test that fails before the fix and passes after.

**Rationale**: Agents transform user input into knowledge-grounded responses;
without enforced tests, silent regressions in agent behavior are invisible.

### III. Static Type Safety (mypy + django-stubs)

All Python code MUST carry type hints on function signatures and public
interfaces. Type correctness MUST be verified with `mypy` (configured with the
`django-stubs` plugin so the ORM is understood), and the type check MUST pass
with zero errors before code is merged. Any `# type: ignore` MUST name the
specific error code and be justified by a comment.

**Rationale**: Type hints checked by `mypy` + `django-stubs` catch a whole class
of integration bugs at edit time rather than runtime, which matters most at the
boundaries between views, agents, and their knowledge bases. `django-stubs` is
required because a Django-unaware checker floods the ORM with false positives.

### IV. Consistent Formatting & Linting (ruff)

All code MUST be formatted and linted with `ruff`. Formatting is not a matter of
preference: the repository's `ruff` configuration is authoritative, and CI MUST
reject unformatted or lint-failing code.

**Rationale**: A single, automated formatter removes style debate from review
and keeps diffs focused on behavior.

### V. Agent-Centric Architecture

The domain MUST be modeled around independent agents. Each agent encapsulates
its own prompt and its own knowledge base, and processes an incoming user
message to produce a response independently of other agents. A user message is
dispatched to a set of agents; one agent's processing MUST NOT depend on
another agent's output. Adding, removing, or reconfiguring an agent MUST NOT
require changes to unrelated agents or to the message-dispatch flow.

**Rationale**: The core product is a multi-persona chat where separate agents
answer the same prompt from different knowledge; isolating agents keeps personas
composable and independently testable.

## Technology Stack

The following stack is normative. Substitutions require a constitution amendment.

- **Package & environment management**: `uv`.
- **Language**: Python (managed/pinned via `uv`).
- **Web framework**: Django, using Function-Based Views only.
- **Database**: PostgreSQL.
- **Frontend interactivity**: HTMX for server-driven partial updates; Alpine.js
  for local client-side state.
- **Styling**: Tailwind CSS with the daisyUI component layer.
- **Testing**: `pytest`.
- **Type checking**: `mypy` with `django-stubs`.
- **Formatting & linting**: `ruff`.

Frontend behavior SHOULD be expressed through HTMX and Alpine.js rather than
bespoke JavaScript; introducing a heavier frontend framework is out of scope.

## Development Workflow & Quality Gates

Before any change is merged, all of the following gates MUST pass:

1. `ruff` format and lint checks pass with no violations.
2. `mypy` type checks pass with zero errors.
3. The full `pytest` suite passes, including tests for the new or changed
   behavior.

Pull requests MUST be reviewed for compliance with the Core Principles, in
particular the FBV-only rule (Principle I) and the agent-isolation rule
(Principle V). Any deviation from a principle MUST be justified in writing in the
PR description, or the PR MUST be changed to comply.

## Governance

This constitution supersedes all other development practices for the strophae
project. When guidance conflicts, the constitution wins.

Amendments MUST be proposed as a change to this file, MUST include an updated
Sync Impact Report, and MUST be reviewed and approved before merge. Versioning
follows semantic versioning:

- **MAJOR**: Backward-incompatible removal or redefinition of a principle or
  governance rule.
- **MINOR**: A new principle or section is added, or existing guidance is
  materially expanded.
- **PATCH**: Clarifications, wording, or non-semantic refinements.

All PRs and reviews MUST verify compliance with the principles and quality
gates defined here. Complexity that violates a principle MUST be justified in the
Complexity Tracking section of the relevant plan, or removed. Project-level
agent guidance for day-to-day development is recorded in `CLAUDE.md`.

**Version**: 1.1.0 | **Ratified**: 2026-06-28 | **Last Amended**: 2026-07-01
