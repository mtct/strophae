# Research: Default Agent Model — DeepSeek 4 Flash

## R1 — Which OpenRouter model does "DeepSeek 4 Flash" map to?

- **Decision**: User-facing label `DeepSeek 4 Flash` → OpenRouter slug
  `deepseek/deepseek-v4-flash`.
- **Rationale**: The user's phrase "deepseek 4 flash" corresponds to DeepSeek's **V4 Flash**
  model, which OpenRouter exposes under the slug `deepseek/deepseek-v4-flash` (confirmed
  against the OpenRouter DeepSeek provider catalog). The label matches the existing naming
  style of `OPENROUTER_MODELS` (e.g. "DeepSeek V3"); we keep the user's phrasing
  "DeepSeek 4 Flash" as the display label.
- **Alternatives considered**:
  - `deepseek/deepseek-v4-pro` — rejected; "Pro" is the larger sibling, not "Flash".
  - `deepseek/deepseek-chat` (current "DeepSeek V3") — rejected; that is the existing V3
    option, not V4 Flash.

## R2 — Where is the "default model" actually set?

- **Decision**: There are exactly two creation-time defaults plus one registry:
  1. `chat/defaults.py` → `DEFAULT_AGENT['model']` — the starter agent that seeds every new
     session (used by the draft-creation flow, `chat/views.py:33`).
  2. `chat/views.py` → `add_agent()` — hard-coded `model='GPT-4o'` for an added blank column.
  3. `config/settings.py` → `OPENROUTER_MODELS` (selector list) + `OPENROUTER_MODEL_SLUGS`
     (label→slug map, read by `Agent.model_slug`).
- **Rationale**: Grepping `model=`, `OPENROUTER_MODEL`, and the templates shows the picker
  iterates `settings.OPENROUTER_MODELS` in every template (`chat.html`, `settings.html`,
  `agent_card.html`), so registering the label once makes it selectable everywhere with no
  template edits.
- **Alternatives considered**: Introduce a single `DEFAULT_MODEL` constant referenced by both
  creation sites — attractive for DRY, but adds indirection for two call sites; deferred as a
  tidy-up, not required. Current plan sets both sites to the same literal to stay minimal
  (YAGNI, Principle I). *(Optional: extract `defaults.DEFAULT_MODEL` if a reviewer prefers it.)*

## R3 — Does this need a data migration?

- **Decision**: No migration.
- **Rationale**: `Agent.model` is a stored string set at creation. The change only alters the
  value assigned to *new* blank agents; existing rows, personas, and seeded data keep their
  stored model. No schema field changes.
- **Alternatives considered**: Back-fill existing GPT-4o agents to DeepSeek 4 Flash — rejected;
  spec FR-005/SC-004 explicitly forbid retroactive edits.

## R4 — Keep or replace "DeepSeek V3" in the selector?

- **Decision**: Keep "DeepSeek V3"; **add** "DeepSeek 4 Flash" as an additional option.
- **Rationale**: Spec assumption — the request is about the *default*, not removing choices.
  Removing V3 would silently change any existing agent still labelled "DeepSeek V3".
- **Alternatives considered**: Replace V3 with V4 Flash — rejected without an explicit user
  request; would orphan the "DeepSeek V3" label on existing agents.
