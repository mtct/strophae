# Quickstart: Internationalization (i18n) Support

**Feature**: 002-i18n-support

## One-time dev setup

```bash
# GNU gettext is required by `makemessages` (macOS ships without it)
brew install gettext

uv sync
uv run python manage.py migrate
```

## Translation workflow

```bash
# 1. After adding/changing translatable strings in templates or Python:
uv run python manage.py makemessages -l it --no-obsolete

# 2. Edit locale/it/LC_MESSAGES/django.po (fill the msgstr entries)

# 3. Compile — commit BOTH django.po and django.mo (no build pipeline exists):
uv run python manage.py compilemessages
```

Adding a third language later = add one tuple to `LANGUAGES` in
`config/settings.py`, then run the same three steps with the new code (FR-012 —
no feature code changes).

## Manual verification

```bash
uv run python manage.py runserver
```

1. **Browser detection (FR-005)**: with the browser's preferred language set to
   Italian and no cookie, the login page renders in Italian; set it to French →
   English.
2. **Signed-out choice (FR-006)**: pick English in the login-page selector, reload
   → still English regardless of browser language.
3. **Account preference (FR-004/FR-015)**: sign in as `alex@strophae.app` / `demo`
   with the device set to Italian — first sign-in adopts Italian into the account.
   Sign out, switch the device to English, sign in again → back to Italian
   (account wins).
4. **Coverage (FR-001/FR-011)**: walk compose → chat → settings → members in
   Italian; trigger a toast (e.g. save a persona) and a validation error — all
   localized. Messages/persona prompts stay exactly as authored (FR-010).
5. **Creation language (FR-014)**: with the UI in Italian, start a new session —
   the starter agent's name/prompt are the Italian ones; switch the UI back to
   English — that agent keeps its Italian text.
6. **Sidebar (FR-008/FR-009)**: in Italian, group labels read "Oggi"/"Ieri"/…
   and relative times use Italian forms.

## Tests & gates (constitution)

```bash
uv run ruff check . && uv run ruff format --check .
uv run mypy .
uv run pytest chat/tests/ -k i18n     # feature tests
uv run pytest                          # full suite
```
