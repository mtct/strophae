# Implementation Plan: Default Agent Model — DeepSeek 4 Flash

**Branch**: `001-default-agent-model` | **Date**: 2026-07-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-default-agent-model/spec.md`

## Summary

Change the model a **blank** agent takes on creation from `GPT-4o` to **DeepSeek 4 Flash**,
and add that model as a selectable option in the per-agent picker. Technically this is a
data/config change in three places: register the new label→slug pair in
`config/settings.py` (`OPENROUTER_MODELS`, `OPENROUTER_MODEL_SLUGS`), and switch the two
creation-time defaults (`chat/defaults.py` `DEFAULT_AGENT`, `chat/views.py` `add_agent`).
No schema change, no migration — existing rows keep their stored model.

## Technical Context

**Language/Version**: Python 3.13 (managed via `uv`)  
**Primary Dependencies**: Django 6.0, htmx, Alpine.js (no new dependency)  
**Storage**: Database-backed `Agent.model` (label string); default applied at creation time only  
**Testing**: `pytest` (per constitution; repo has no tests yet — this feature adds the first)  
**Target Platform**: Django server-rendered web app  
**Project Type**: Single Django project, single app (`chat`)  
**Performance Goals**: N/A — no runtime hot path affected  
**Constraints**: Live model calls run browser→OpenRouter; the new label MUST map to a valid OpenRouter slug (`deepseek/deepseek-v4-flash`)  
**Scale/Scope**: 3 source files touched + 1 test module; ~10 lines of production change

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity & Linearity (FBV-first) | PASS | Change is module-level constants + one existing FBV (`add_agent`); no new views, no CBV, no abstraction added. |
| II. Test-First Coverage (pytest) | PASS | Feature adds `chat/tests/` covering the two creation defaults and slug mapping; no feature-complete without passing tests. |
| III. Static Type Safety (mypy + django-stubs) | PASS | Full type-hint pass applied across `chat`/`config`; `mypy --strict-ish` with `django-stubs` is green (0 errors). Constitution v1.1.0 switched the checker from `ty` (no Django support) to `mypy`. |
| IV. Formatting & Linting (ruff) | PASS | Trivial edits; `ruff format`/`ruff check` must pass. |
| V. Agent-Centric Architecture | PASS | Only the *default model label* changes; agent isolation and dispatch flow untouched. |

**Result**: PASS — no violations, Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/001-default-agent-model/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── model-registry.md # Phase 1 output — the label/slug + default contract
└── checklists/
    └── requirements.md   # From /speckit-specify
```

### Source Code (repository root)

```text
config/
└── settings.py          # OPENROUTER_MODELS (+ "DeepSeek 4 Flash"),
                         # OPENROUTER_MODEL_SLUGS (+ deepseek/deepseek-v4-flash)

chat/
├── defaults.py          # DEFAULT_AGENT['model'] -> "DeepSeek 4 Flash"
├── views.py             # add_agent(): model='DeepSeek 4 Flash'
├── models.py            # Agent.model_slug (unchanged; reads the new mapping)
└── tests/
    └── test_default_model.py  # NEW — asserts the creation defaults + slug mapping
```

**Structure Decision**: Existing single-app Django layout is reused as-is. No files are
added except the test module; all production edits are in three existing files. The model
picker (`templates/chat/*.html`) needs **no** edit because it iterates
`settings.OPENROUTER_MODELS`, so adding the label there makes it selectable everywhere.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
