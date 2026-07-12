# Quickstart: Default Agent Model — DeepSeek 4 Flash

## What changes

New **blank** agents default to **DeepSeek 4 Flash** (`deepseek/deepseek-v4-flash`) instead of
GPT-4o. "DeepSeek 4 Flash" also becomes a selectable option in the model picker. Existing
agents/personas/seed data are untouched.

## Implementation checklist (3 files + 1 test)

1. **`config/settings.py`**
   - Add `'DeepSeek 4 Flash'` to `OPENROUTER_MODELS`.
   - Add `'DeepSeek 4 Flash': 'deepseek/deepseek-v4-flash'` to `OPENROUTER_MODEL_SLUGS`.
2. **`chat/defaults.py`** — set `DEFAULT_AGENT['model'] = 'DeepSeek 4 Flash'`.
3. **`chat/views.py`** — in `add_agent`, change `model='GPT-4o'` → `model='DeepSeek 4 Flash'`.
4. **`chat/tests/test_default_model.py`** (new) — assert C1–C4 from the contract.

## Manual verification

```bash
uv run python manage.py check
uv run python manage.py test          # or: uv run pytest
uv run python manage.py runserver
```

Then, signed in as `alex@strophae.app` / `demo`:

- Start a new session → the starter agent's model reads **DeepSeek 4 Flash**.
- Add an agent column → its model reads **DeepSeek 4 Flash**.
- Open a model picker → **DeepSeek 4 Flash** is listed and selectable.
- Open an existing seeded conversation → its agents keep their original models.

## Quality gates (constitution)

```bash
uv run ruff format . && uv run ruff check .
uv run mypy chat config manage.py   # zero errors (mypy + django-stubs)
uv run pytest            # all pass, incl. new tests
```
