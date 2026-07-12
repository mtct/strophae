# Implementation Plan: Internationalization (i18n) Support

**Branch**: `002-i18n-support` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-i18n-support/spec.md`

## Summary

Add full interface internationalization to strophae with English (default/fallback)
and Italian at launch, using Django's built-in i18n machinery — no new runtime
dependencies. Per-request language resolution is delegated entirely to
`LocaleMiddleware` + the standard language cookie (device choice, FR-006, and
browser detection, FR-005). The account preference (FR-004) is a new
`User.language` field kept in sync with the cookie at exactly two mutation points:
the new `set_language` view and login (where FR-015 precedence/adoption is applied).
All template text is wrapped with `{% translate %}`; view-produced toasts/errors and
the relative-time/sidebar-group helpers use `gettext`/`ngettext`; the few strings the
Alpine chat client generates in JS come from a per-request `json_script` dict.
Product-created defaults (starter agent "Simple Jack", default personas) are marked
with `gettext_noop` and materialised with `gettext()` at creation time (FR-014).

## Technical Context

**Language/Version**: Python 3.13, Django 6.0 (managed with `uv`)  
**Primary Dependencies**: Django built-in i18n (gettext catalogs, `LocaleMiddleware`); htmx + Alpine.js frontend with no build step; GNU gettext CLI (dev-only, for `makemessages`)  
**Storage**: SQLite in dev (constitution targets PostgreSQL — pre-existing deviation, see Complexity Tracking); one new additive `language` column on `chat.User`  
**Testing**: pytest + pytest-django (existing `chat/tests/` layout)  
**Target Platform**: server-rendered web app (Django templates + htmx partials + Alpine islands)
**Project Type**: web application, single Django app (`chat`)  
**Performance Goals**: no measurable per-request overhead (compiled `.mo` catalogs are cached in-process by Django); a language switch takes effect on the very next rendered response (SC-002)  
**Constraints**: no JS build step, so client-side strings must arrive via server-rendered templates/`json_script`; the OpenRouter streaming path is untouched; only product UI text is translated — user content and LLM output are never transformed (FR-010)  
**Scale/Scope**: 2 locales at launch (`en` base, `it`), 7 templates + 3 partials, ~80–120 translatable strings, 1 new model field + migration, 1 new endpoint, ~6 new test modules

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Verdict | Notes |
|-----------|---------|-------|
| I. Simplicity & Linearity (FBV-first) | PASS | One new function-based view (`set_language`). No CBVs. **No custom middleware**: the cookie-sync-at-login design keeps per-request resolution inside stock `LocaleMiddleware` and account sync inside two linear view code paths. |
| II. Test-First Coverage (pytest) | PASS | Every FR-visible behavior gets a pytest module (cookie set/adoption/precedence, Italian rendering, English fallback, creation-time language of defaults, localized sidebar labels). No network needed — catalogs are local. |
| III. Static Type Safety (mypy + django-stubs) | PASS | New code fully annotated; no new `# type: ignore` anticipated (gettext APIs are typed in Django). |
| IV. Formatting & Linting (ruff) | PASS | No config changes; new code follows repo style. |
| V. Agent-Centric Architecture | PASS | Message dispatch and agent isolation untouched; i18n affects UI chrome and creation-time defaults only. |
| Technology Stack | NOTE | Repo currently runs SQLite while the constitution mandates PostgreSQL. Pre-existing deviation, not introduced or widened here (the new field is a portable `CharField`). Recorded in Complexity Tracking. |

**Post-design re-check (after Phase 1)**: PASS — the design added no violations: no new abstractions, no middleware, no non-stack dependencies.

## Project Structure

### Documentation (this feature)

```text
specs/002-i18n-support/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── http.md          # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
config/
└── settings.py                    # LANGUAGE_CODE='en', LANGUAGES=[en,it], LocaleMiddleware,
                                   # LOCALE_PATHS, i18n context processor

chat/
├── models.py                      # User.language ('' = never chosen)
├── migrations/0004_user_language.py   # additive migration (number = next free)
├── views.py                       # set_language FBV; login/signup sync + FR-015 adoption;
│                                  # gettext in toasts/errors; _rel_time/_group_label/
│                                  # conversation_groups localized (buckets re-keyed by id)
├── defaults.py                    # gettext_noop-marked DEFAULT_AGENT / DEFAULT_AGENTS values
│                                  # + a small materialise-with-gettext helper
├── management/commands/seed.py    # seed inside translation.override('en')
├── urls.py                        # path('i18n/set-language/', ...)
└── tests/
    ├── test_i18n_set_language.py  # endpoint contract: cookie, account save, redirect safety
    ├── test_i18n_precedence.py    # FR-004/005/006/015 login precedence & adoption
    ├── test_i18n_rendering.py     # Italian UI text, English fallback, <html lang>
    ├── test_i18n_defaults.py      # FR-014: starter agent / personas born in active language
    └── test_i18n_sidebar.py       # localized group labels & relative times, plural forms

templates/
├── base.html                      # {% load i18n %}, <html lang="{{ LANGUAGE_CODE }}">,
│                                  # user-menu language selector, i18n-strings json_script
└── chat/
    ├── login.html                 # signed-out language selector (footer)
    ├── _app.html / chat.html / compose.html / members.html / settings.html
    │                              # {% translate %} sweep; settings gains a Language section
    └── partials/*.html            # {% translate %} sweep

locale/
└── it/LC_MESSAGES/django.po       # Italian catalog (compiled .mo committed too — no build step)
```

**Structure Decision**: the existing single-app layout is retained; every change is
additive. The only new top-level directory is `locale/` (standard Django location,
wired via `LOCALE_PATHS`). The language selector lives in the signed-in user menu in
`base.html` plus a Language section on the settings screen, and as a small footer
selector on `login.html` for signed-out visitors — this resolves the UX placement
question deferred by `/speckit-clarify`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| SQLite in dev vs. constitution-mandated PostgreSQL | Pre-existing project state; this feature only adds one portable `CharField` and touches no DB-specific behavior | Migrating the database engine inside an i18n feature would couple two unrelated risks; it belongs in its own change with its own plan |
