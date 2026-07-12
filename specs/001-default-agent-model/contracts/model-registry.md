# Contract: Model Registry & Creation Defaults

This feature's "interface" is the app's model registry and the creation-time defaults. The
observable contract (verifiable without knowing implementation) is:

## C1 — Registry contract (`config/settings.py`)

- `OPENROUTER_MODELS` **contains** `"DeepSeek 4 Flash"`.
- `OPENROUTER_MODEL_SLUGS["DeepSeek 4 Flash"] == "deepseek/deepseek-v4-flash"`.
- Every entry in `OPENROUTER_MODELS` has a key in `OPENROUTER_MODEL_SLUGS` (registry
  completeness invariant, still true after the addition).

## C2 — Starter-agent default contract (`chat/defaults.py`)

- `DEFAULT_AGENT["model"] == "DeepSeek 4 Flash"`.
- Creating a draft via the normal flow yields a starter agent whose `.model` is
  `"DeepSeek 4 Flash"` and whose `.model_slug` is `"deepseek/deepseek-v4-flash"`.

## C3 — Added-column default contract (`chat/views.py::add_agent`)

- `POST c/<id>/add-agent/` (owned conversation) creates an `Agent` with
  `model == "DeepSeek 4 Flash"`.

## C4 — Non-regression contract

- No existing `Agent`, `Persona`, `SharedPersona`, or seeded row changes its `model` as a
  result of this change (default applies at creation only).
- The picker in `chat.html` / `settings.html` / `agent_card.html` renders "DeepSeek 4 Flash"
  as a selectable option with no template edit (it iterates `OPENROUTER_MODELS`).

## Verification (maps to spec Success Criteria)

| Contract | Spec SC | How verified |
|----------|---------|--------------|
| C2 | SC-001 | Test: create draft → assert starter agent model. |
| C3 | SC-002 | Test: POST add_agent → assert new agent model. |
| C1 | SC-003 | Test: assert label in list + slug mapping. Manual: open picker. |
| C4 | SC-004 | Test: seed/persona models unchanged after import. |
