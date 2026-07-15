---
description: "Task list for Default Agent Model — DeepSeek 4 Flash"
---

# Tasks: Default Agent Model — DeepSeek 4 Flash

**Input**: Design documents from `/specs/001-default-agent-model/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/model-registry.md

**Tests**: MANDATORY per Constitution Principle II (Test-First Coverage). Tests are written FIRST and must FAIL before the corresponding implementation task.

**Organization**: Tasks are grouped by user story. The shared registry change (label→slug) lives in Foundational because both creation defaults and the picker depend on it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Single Django app `chat` at repo root. Production files: `config/settings.py`, `chat/defaults.py`, `chat/views.py`. Tests: `chat/tests/` (pytest + pytest-django).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the pytest harness the repo does not yet have (first tests in the project).

- [X] T001 Add `pytest` and `pytest-django` as dev dependencies via `uv` and configure them in `pyproject.toml` (`[tool.pytest.ini_options]` with `DJANGO_SETTINGS_MODULE = "config.settings"`, `python_files = "test_*.py"`) — *installed and working (`uv run python -c "import pytest_django"` OK; Django 6.0.6)*
- [X] T002 [P] Convert the `chat/tests.py` stub into a `chat/tests/` package: remove `chat/tests.py`, create `chat/tests/__init__.py`
- [X] T003 [P] Verify tooling runs green: `uv run pytest` → 9 passed; `uv run ruff check .` → clean; `uv run mypy chat config manage.py` → 0 errors. (`ruff` + `mypy`/`django-stubs` were added; constitution v1.1.0 replaced `ty` with `mypy` since `ty` has no Django support.)

**Checkpoint**: `uv run pytest` collects 0 tests and exits successfully.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Register the new model so both creation defaults and the picker can reference it. Required by ALL user stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 In `config/settings.py`, append `'DeepSeek 4 Flash'` to `OPENROUTER_MODELS` and add `'DeepSeek 4 Flash': 'deepseek/deepseek-v4-flash'` to `OPENROUTER_MODEL_SLUGS` (keep existing `'DeepSeek V3'` entry intact)

**Checkpoint**: `settings.OPENROUTER_MODEL_SLUGS['DeepSeek 4 Flash'] == 'deepseek/deepseek-v4-flash'` and every label in `OPENROUTER_MODELS` has a slug.

---

## Phase 3: User Story 1 - New blank agent defaults to DeepSeek 4 Flash (Priority: P1) 🎯 MVP

**Goal**: The starter agent that seeds every new session uses "DeepSeek 4 Flash".

**Independent Test**: Start a new draft; the starter agent's `.model` reads "DeepSeek 4 Flash" and `.model_slug` reads "deepseek/deepseek-v4-flash".

### Tests for User Story 1 (MANDATORY) ⚠️

> Write first, ensure it FAILS before T006.

- [X] T005 [P] [US1] Write test in `chat/tests/test_starter_default.py` asserting a newly created draft's starter agent has `model == 'DeepSeek 4 Flash'` and `model_slug == 'deepseek/deepseek-v4-flash'` (drive draft creation through the real flow, e.g. `_owned`/draft helper in `chat/views.py:33`)

### Implementation for User Story 1

- [X] T006 [US1] In `chat/defaults.py`, set `DEFAULT_AGENT['model'] = 'DeepSeek 4 Flash'`

**Checkpoint**: T005 passes; starter agent defaults to DeepSeek 4 Flash.

---

## Phase 4: User Story 2 - Adding an agent column defaults to DeepSeek 4 Flash (Priority: P2)

**Goal**: A newly added blank agent column defaults to "DeepSeek 4 Flash".

**Independent Test**: POST to add-agent on an owned conversation; the created agent's `.model` is "DeepSeek 4 Flash".

### Tests for User Story 2 (MANDATORY) ⚠️

> Write first, ensure it FAILS before T008.

- [X] T007 [P] [US2] Write test in `chat/tests/test_add_agent_default.py` that logs in a user, POSTs the `add_agent` endpoint for an owned conversation, and asserts the new `Agent.model == 'DeepSeek 4 Flash'`

### Implementation for User Story 2

- [X] T008 [US2] In `chat/views.py` `add_agent`, change `model='GPT-4o'` to `model='DeepSeek 4 Flash'`

**Checkpoint**: T007 passes; added columns default to DeepSeek 4 Flash. US1 still passes.

---

## Phase 5: User Story 3 - DeepSeek 4 Flash is selectable in the picker (Priority: P3)

**Goal**: "DeepSeek 4 Flash" is an offered, provider-backed option in the model selector.

**Independent Test**: The model list rendered to the picker contains "DeepSeek 4 Flash" and maps to a valid slug (enabling change lives in T004; this phase locks it with a test).

### Tests for User Story 3 (MANDATORY) ⚠️

- [X] T009 [P] [US3] Write test in `chat/tests/test_model_registry.py` asserting `'DeepSeek 4 Flash' in settings.OPENROUTER_MODELS`, its slug maps to `'deepseek/deepseek-v4-flash'`, and every label in `OPENROUTER_MODELS` has a matching key in `OPENROUTER_MODEL_SLUGS` (registry completeness)

### Implementation for User Story 3

- [X] T010 [US3] No new production code — the selectable behaviour is delivered by T004; confirmed `partials/agent_card.html:13` renders options by iterating `OPENROUTER_MODELS` (no edit needed) — confirm the picker templates (`templates/chat/chat.html`, `settings.html`, `partials/agent_card.html`) render it by iterating `OPENROUTER_MODELS` (no edit expected)

**Checkpoint**: T009 passes; "DeepSeek 4 Flash" is selectable everywhere.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Guard non-regression and run the constitution quality gates.

- [X] T011 [P] Write non-regression test in `chat/tests/test_no_regression.py` asserting personas/shared personas and `DEFAULT_AGENTS` seed entries keep their explicit models (e.g. `DEFAULT_AGENTS[0]['model'] == 'GPT-4o'`), proving the default change is not retroactive (SC-004)
- [X] T012 Run quality gates — all green: `uv run ruff check .` (clean), `uv run mypy chat config manage.py` (**0 errors**, mypy + django-stubs), `uv run pytest` (**9 passed**), `uv run python manage.py check` (**0 issues**).
- [X] T013 Partial: `uv run python manage.py check` → 0 issues; template inspection confirms the picker renders "DeepSeek 4 Flash". Interactive `runserver` click-through NOT performed in this non-interactive session.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2 / T004)**: Depends on Setup — BLOCKS all user stories (all tests reference the registered label/slug).
- **User Stories (Phase 3–5)**: All depend on T004. After it, US1/US2/US3 are independent and can proceed in parallel.
- **Polish (Phase 6)**: After the user stories you intend to ship.

### User Story Dependencies

- **US1 (P1)**: After T004. Independent.
- **US2 (P2)**: After T004. Independent of US1.
- **US3 (P3)**: After T004 (its implementation IS T004). Independent.

### Within Each User Story

- Test task (write, watch it FAIL) → implementation task → checkpoint.

### Parallel Opportunities

- T002 and T003 (Setup) can run in parallel.
- Once T004 is done, the three test-writing tasks T005, T007, T009 touch different files and can be written in parallel.
- T006 and T008 edit different files (`defaults.py` vs `views.py`) — parallelizable once their tests exist.
- T011 (polish test) is independent of the others.

---

## Parallel Example: after Foundational (T004)

```bash
# Write all three story tests together (different files):
Task: "test_starter_default.py — US1 starter agent default"
Task: "test_add_agent_default.py — US2 add_agent default"
Task: "test_model_registry.py — US3 registry + slug mapping"

# Then apply the two independent production edits together:
Task: "chat/defaults.py — DEFAULT_AGENT['model'] = 'DeepSeek 4 Flash'"
Task: "chat/views.py — add_agent model='DeepSeek 4 Flash'"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup (pytest harness).
2. Phase 2: Foundational (T004 registry).
3. Phase 3: US1 (starter agent default) → validate → this is the headline behaviour and a shippable MVP.

### Incremental Delivery

1. Setup + Foundational → registry ready.
2. US1 → new sessions default to DeepSeek 4 Flash (MVP).
3. US2 → added columns match.
4. US3 → picker option locked by test.
5. Polish → non-regression + quality gates.

---

## Notes

- Total tasks: 13 (Setup 3, Foundational 1, US1 2, US2 2, US3 2, Polish 3).
- The entire production change is ~4 lines across 3 files; most tasks are harness + tests, mandated by Constitution Principle II (the repo has no tests yet).
- Verify each test FAILS before its implementation task.
- Commit after each task or logical group.
