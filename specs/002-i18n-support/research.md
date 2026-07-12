# Research: Internationalization (i18n) Support

**Feature**: 002-i18n-support | **Date**: 2026-07-12

No NEEDS CLARIFICATION markers remained in the Technical Context; the research
below records the technology decisions and the alternatives that were rejected.

## R1. Per-request language resolution

**Decision**: Stock `django.middleware.locale.LocaleMiddleware` (inserted between
`SessionMiddleware` and `CommonMiddleware`) with the standard language cookie
(`django_language`) as the single per-request source of truth. Resolution order it
gives for free: cookie → `Accept-Language` header → `LANGUAGE_CODE` fallback — which
maps 1:1 onto FR-006 (device choice), FR-005 (browser detection) and FR-007/FR-002
(English fallback).

**Rationale**: Zero custom code on the hot path; the exact behavior the spec asks
for is Django's default detection chain.

**Alternatives considered**:
- *URL language prefixes (`i18n_patterns`, `/it/...`)* — rejected: the app is
  auth-gated (no SEO value), and prefixing would break every hardcoded htmx
  endpoint URL for no user benefit.
- *Custom middleware that reads `user.language` on every request* — rejected: it
  must run after `AuthenticationMiddleware`, which sits after the point where
  `LocaleMiddleware` belongs, forcing either a second activation pass or a
  non-standard middleware order. The cookie-sync design (R3) achieves the same
  observable behavior with two linear view-code touch points and no middleware at
  all — better fit for Constitution Principle I.

## R2. Language catalog & settings

**Decision**: `LANGUAGE_CODE = 'en'` (changed from `'en-us'` so the base language
matches the catalog id), `LANGUAGES = [('en', 'English'), ('it', 'Italiano')]`,
`LOCALE_PATHS = [BASE_DIR / 'locale']`, and the
`django.template.context_processors.i18n` context processor. The selector renders
endonyms via `translation.get_language_info(code)['name_local']` (FR-013).

**Rationale**: Standard Django layout; `USE_I18N = True` is already set. Endonyms
from `get_language_info` avoid hand-maintaining display names.

**Alternatives considered**: hardcoding endonym labels in the template — rejected,
`get_language_info` already ships them.

## R3. Account preference storage & precedence (FR-004/005/006/015)

**Decision**: New field `User.language = CharField(max_length=10, blank=True,
default='')` where `''` means "never chosen" (required to make FR-015 adoption
detectable). Sync happens at exactly two mutation points, both plain FBV code:

1. **`set_language` view** (R4): sets the cookie; if authenticated, also saves
   `user.language`.
2. **Login (and signup)**: after `login()` —
   - if `user.language` is set → overwrite the cookie with it (account wins);
   - elif the request carries a language cookie → adopt it into `user.language`
     (first-sign-in adoption);
   - else → do nothing (browser detection keeps applying until a choice is made).
   Signup counts as a first sign-in: a device-chosen language is adopted into the
   new account.

**Rationale**: The cookie remains the only thing the request path reads; account
sync lives in the two places where preference can change. Covers SC-003 (survives
sign-out/sign-in/device change — the cookie is refreshed at every login).

**Alternatives considered**:
- *Session-based storage* — rejected: dies at logout, violating FR-006.
- *Per-request `user.language` activation middleware* — rejected (see R1). Known
  accepted gap: a preference changed on device B is picked up on device A at A's
  next sign-in, not mid-session — consistent with SC-003's wording.

## R4. Language-change endpoint

**Decision**: A custom FBV `set_language` (POST `i18n/set-language/`), not
`django.views.i18n.set_language`. It validates the code against
`settings.LANGUAGES`, sets the cookie with Django's standard cookie parameters,
persists `user.language` when authenticated, and redirects to a `next` path
validated with `url_has_allowed_host_and_scheme` (fallback: `home`).

**Rationale**: The built-in view handles cookie + redirect but cannot save the
account preference (FR-004) — wrapping it would be more code than a straight FBV.

**Alternatives considered**: built-in `set_language` + a signal/second endpoint for
persistence — rejected as two moving parts for one action.

## R5. Template & client-side strings

**Decision**: `{% load i18n %}` + `{% translate %}`/`{% blocktranslate %}` across
all templates (including Alpine markup — it is server-rendered Django template
text, so x-show/x-text labels written in HTML translate normally). The handful of
strings the chat client *generates in JS* (streaming error text, "Thinking…",
copy-to-clipboard toasts, missing-key warnings) move to a `json_script` dict
(`i18n-strings`) rendered per request in `base.html` and read by the Alpine
components. `<html lang="{{ LANGUAGE_CODE }}">` is set in `base.html`.

**Rationale**: No build step exists, and nearly all text is server-rendered
anyway; a per-request JSON blob of ~a dozen strings is the smallest mechanism that
keeps JS-generated messages localized.

**Alternatives considered**: `JavaScriptCatalog` view — rejected: an extra
endpoint, an extra fetch, and a global `gettext()` shim for a dozen strings.

## R6. Dates, relative times, plural forms

**Decision**: Localize `_rel_time` and `_group_label` in `chat/views.py` with
`gettext`/`ngettext` (pattern strings like "just now", "yesterday", "%dm ago",
"Today", "Previous 7 days"). `conversation_groups` currently keys its buckets by
the English label — re-key by a stable id (`today`, `yesterday`, `week`,
`earlier`) and translate only at render. Any timestamps the Alpine client formats
use `Intl.DateTimeFormat(document.documentElement.lang)`. Django ≥4 localizes
`{{ ...|date }}` output automatically when `USE_I18N` is on.

**Rationale**: Keys must not change when the language does; `ngettext` gives
correct plural rules per language (FR-009).

**Alternatives considered**: `django.contrib.humanize` `naturaltime` — rejected:
different wording than the prototype's compact "5m ago" style; the existing helper
is already there and only needs its strings marked.

## R7. Creation-time language for product-created content (FR-014)

**Decision**: Mark `DEFAULT_AGENT` / `DEFAULT_AGENTS` names and system prompts in
`chat/defaults.py` with `gettext_noop` (so `makemessages` extracts them) and add a
small helper that materialises a config dict through `gettext()` at creation time
(`create_session`, blank `add_agent`, and any other place a default is
instantiated). Once written to the DB the text is user content and is never
touched again. `manage.py seed` runs inside `translation.override('en')` so demo
data is deterministic English (per spec assumption).

**Rationale**: `gettext_noop` + late `gettext()` is the canonical Django pattern
for "translate at use time, not import time"; it implements the clarified rule
(born in the interface language, then frozen) with no schema impact.

**Alternatives considered**: storing a language-neutral key on Agent/Persona and
translating at render — rejected: violates FR-010/FR-014 (content would keep
switching language after creation) and adds schema complexity.

## R8. Translation toolchain

**Decision**: GNU gettext installed via Homebrew (dev prerequisite) for
`manage.py makemessages -l it` / `manage.py compilemessages`. Both the `.po`
source catalog **and** the compiled `.mo` are committed, since the project has no
build pipeline to compile at deploy time. Translations for the launch catalog are
authored in-repo (Italian).

**Rationale**: Matches the project's "no build step" reality; committing `.mo` is
the smallest thing that keeps `uv run python manage.py runserver` working from a
fresh clone.

**Alternatives considered**: compiling `.mo` in CI/deploy — rejected for now
(there is no CI/deploy pipeline yet); revisit when one exists.

## R9. Testing approach

**Decision**: pytest + pytest-django `client` tests, using `translation.override`
and cookie manipulation. Coverage map: endpoint contract (R4), login
precedence/adoption matrix (R3), Italian rendering of known strings + English
fallback for untranslated ones, `<html lang>` value, FR-014 creation language for
the starter agent, localized sidebar group labels and plural forms. No network, no
OpenRouter involvement.

**Rationale**: Constitution Principle II; all behaviors are assertable through the
test client and the ORM.
