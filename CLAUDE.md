# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What strophae is

**strophae** is a multi-persona ("multi-LLM") chat app. One prompt is broadcast in
parallel to several agents — each with its own name, colour, model and system prompt —
and every agent answers in its own column, streaming live. It was implemented from a
`claude.ai/design` prototype (`Strophae.dc.html`).

## Stack & tooling

- **Python 3.13 / Django 6.0**, managed with **uv** (`pyproject.toml`, `uv.lock`).
- **PostgreSQL 17** (constitution-mandated stack). `config/settings.py` reads
  `POSTGRES_*` env vars with dev defaults (`strophae`/`strophae`@127.0.0.1:5432);
  driver is `psycopg` 3.
- Frontend: server-rendered Django templates + **htmx** (CRUD / navigation partials),
  **Alpine.js** (menus, toasts, the chat client, the API-key store), and
  **Tailwind + DaisyUI** loaded via CDN. The precise visual identity from the prototype
  (oklch accents, Hanken Grotesk / IBM Plex Mono, exact spacing) is preserved with
  inline styles + the `.sc-*` helper classes in `templates/base.html`. The inline-style
  linter warnings are expected and intentional.
- No JS build step. The CDNs (Tailwind Play CDN especially) are **dev-only**; a real
  deployment needs a compiled Tailwind/DaisyUI bundle, pinned SRI-hashed assets, and
  `DEBUG=False` + a real `SECRET_KEY`.

### Commands

- Install: `uv sync`
- Database (one-time): `brew install postgresql@17 && brew services start postgresql@17`,
  then `createuser --createdb strophae && createdb -O strophae strophae`
  (CREATEDB is needed so pytest can create its test database).
- Run: `uv run python manage.py runserver`
- Migrate: `uv run python manage.py makemigrations && uv run python manage.py migrate`
- Seed demo data: `uv run python manage.py seed` (creates demo users — sign in with
  `alex@strophae.app` / `demo` — plus shared personas and seeded history for Alex)
- Checks: `uv run python manage.py check`
- Tests: `uv run pytest` (pytest + pytest-django, per the constitution; single test:
  `uv run pytest chat/tests/test_x.py::TestClass::test_name`).
- Translations: `uv run python manage.py makemessages -l it --no-obsolete`, fill the
  `msgstr` entries in `locale/it/LC_MESSAGES/django.po`, then
  `uv run python manage.py compilemessages -l it`. Needs GNU gettext
  (`brew install gettext`). Commit **both** `.po` and `.mo` — there is no build
  pipeline to compile at deploy time. Watch for `#, fuzzy` entries after
  `makemessages`: fuzzy translations are ignored at compile time.

## Architecture

Single app, `chat`. Custom email-login user model (`chat.User`, `AUTH_USER_MODEL`),
no usernames.

Domain model (`chat/models.py`):
- **User** — email, `name`, `hue` (accent), `role` (Admin/Member).
- **Persona** / **SharedPersona** — reusable agent definitions; personal vs. team-shared.
- **Conversation** — owns `shared_system_prompt` (applied to every agent) + its Agents.
  A *draft* is a Conversation with zero messages; drafts are hidden from the sidebar
  (`conversation_groups` / `get_or_create_draft` filter on message count).
- **Agent** — a column in a conversation: name, hue, model (label), system prompt, order.
  `model_slug` maps the display label → OpenRouter slug via `settings.OPENROUTER_MODEL_SLUGS`.
- **Message** — `user`/`assistant` rows under an Agent.

Colour helpers and all seed/default data live in `chat/defaults.py`. Accent colours are
derived from a hue with `accent()` / `soft()` / `header_bg()` (also exposed as template
filters in `chat/templatetags/strophae.py`).

### How a chat turn flows (real OpenRouter streaming)

The OpenRouter key is **stored only in the browser** (`localStorage['strophae.openrouter']`)
and sent **directly from the browser to OpenRouter** — never to the Django server (matches
the prototype's privacy promise, and is the only sane way to stream N agents in parallel).

1. Compose screen (`compose.html`) edits the draft Conversation's agents + shared prompt;
   every field autosaves via htmx (`update_agent`, `update_shared`, `add_agent`,
   `cycle_color`, `remove_agent`, `save_persona`).
2. Chat screen (`chat.html`) hydrates an Alpine component (`chatApp`) from a
   `json_script` blob of agents+messages. Alpine owns all message rendering.
3. On send: POST `c/<id>/send/` persists the user message + an **empty assistant slot**
   per agent and returns the slot message IDs. The browser then fires one streaming
   `fetch` to OpenRouter per agent (`streamAgent`), appending tokens into each column,
   and POSTs `message/<id>/finalize/` with the final text when each agent completes.

Server endpoints never call OpenRouter; they only persist.

### Conventions

- htmx mutations return `204` (no swap) or a re-rendered partial; toasts are fired via an
  `HX-Trigger: {"toast": "..."}` header, surfaced by the global Alpine listener in
  `base.html`. Set it with `resp['HX-Trigger'] = json.dumps(...)` —
  `HttpResponse.headers` has no `.update()`.
- Ownership is enforced with `_owned_conv` / `_owned_agent` helpers (404 on mismatch).

### Internationalization (spec 002)

- English is the source language; Italian ships in `locale/it/`. Adding a language =
  one tuple in `settings.LANGUAGES` + a translated catalog; no code changes.
- Per-request resolution is stock `LocaleMiddleware` + the language cookie — **no
  custom middleware**. The account preference (`User.language`, `''` = never chosen)
  is synced with the cookie at exactly two points: the `set_language` FBV and
  `_sync_language_at_login` (login/signup). At sign-in the account wins; an account
  with no preference adopts the device cookie (FR-015). `switch_user` applies the
  target's language but never adopts (impersonation must not write someone else's
  choice into the account).
- Only product UI text is translated. User content (messages, titles, persona/agent
  names & prompts) and LLM replies are never touched. Product-created defaults
  (starter agent, `Agent N` names, `New session` titles) are `gettext_noop`-marked in
  `chat/defaults.py` and materialised with `gettext()` at creation time
  (`defaults.localized_agent`), then frozen as user content. `manage.py seed` runs
  under `translation.override('en')` — demo data is deliberately English.
- JS-visible strings live in server-rendered templates: use
  `{% translate "..." as t %}` + `'{{ t|escapejs }}'` inside script/attribute JS.
  Avoid `%` in `{% translate %}` template strings (extraction doubles it to `%%`);
  use `{n}`-style placeholders with a JS `.replace()` instead.
- Sidebar buckets are keyed by stable ids (`today`/`yesterday`/`week`/`earlier`);
  only `GROUP_LABELS` (lazy) is translated at render.

### Authorization model

- Per-resource ownership: conversations/agents/messages/personas are scoped to
  `request.user` in the queryset (`_owned_*`, and `Persona`/`SharedPersona` filters) so
  IDOR returns 404.
- Workspace admin actions — `invite_member`, `set_role`, `remove_member` — require
  `request.user.role == Admin` (`_is_admin`); admins can't change/remove **themselves**.
  `unshare_persona` is restricted to the persona's author, with an admin override.
- `switch_user` is account impersonation kept **only as a local demo affordance**: it
  returns 403 unless `settings.DEBUG`, and its "Switch account" UI is hidden when not in
  DEBUG. It must never be exposed in a real deployment.
- Invited members get a random (`secrets.token_urlsafe`) password, not a shared one — a
  real product would email a set-password/invite token instead. The *seeded* demo users
  (`manage.py seed`) deliberately use `demo` so you can sign in locally.
- The UI hides controls a user can't use (admin-only invite form / role+remove controls),
  but the server enforces it regardless.

### Known scope cuts (vs. the prototype)

- File attachments are UI-only in the prototype (name/size metadata); not implemented here.

<!-- SPECKIT START -->
## Active feature plan

- `002-i18n-support` — plan: [specs/002-i18n-support/plan.md](specs/002-i18n-support/plan.md)
<!-- SPECKIT END -->
