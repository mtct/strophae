# Data Model: Default Agent Model — DeepSeek 4 Flash

No schema changes. This feature only changes **default values and a config registry**; the
`Agent` table and all migrations are untouched.

## Affected entity

### Agent (existing — `chat/models.py`)

| Field | Type | Change |
|-------|------|--------|
| `model` | CharField (display label) | **Default value at creation changes** from `"GPT-4o"` to `"DeepSeek 4 Flash"`. Field definition, max_length, and stored rows are unchanged. |

- `Agent.model_slug` (property) is unchanged; it resolves the label via
  `settings.OPENROUTER_MODEL_SLUGS`, so the new label resolves once the registry entry exists.
- **State/lifecycle**: default applies only at `Agent.objects.create(...)` for blank agents.
  No transition affects already-persisted agents.

## Configuration registry (not DB — `config/settings.py`)

| Setting | Change |
|---------|--------|
| `OPENROUTER_MODELS` (list) | Append `"DeepSeek 4 Flash"` so it appears in the selector. |
| `OPENROUTER_MODEL_SLUGS` (dict) | Add `"DeepSeek 4 Flash": "deepseek/deepseek-v4-flash"`. |

## Validation rules

- Every label in `OPENROUTER_MODELS` MUST have a matching key in `OPENROUTER_MODEL_SLUGS`
  (so `model_slug` never falls back to the raw label). This holds for "DeepSeek 4 Flash".
- The two creation defaults (`DEFAULT_AGENT['model']` and `add_agent`) MUST use a label that
  exists in `OPENROUTER_MODELS`.
