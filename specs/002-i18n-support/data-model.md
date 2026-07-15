# Data Model: Internationalization (i18n) Support

**Feature**: 002-i18n-support | **Date**: 2026-07-12

This feature adds **one field to one existing entity**. No new tables, no changes
to Conversation, Agent, Message, Persona or SharedPersona.

## User (extended)

| Field | Type | Constraints | Meaning |
|-------|------|-------------|---------|
| `language` | `CharField(max_length=10)` | `blank=True`, `default=''` | The account's saved interface language code (`'en'`, `'it'`). Empty string = the user has **never chosen** a language — required to make FR-015 first-sign-in adoption detectable. |

**Validation**: when set, the value must be one of the codes in
`settings.LANGUAGES`. Enforced at the `set_language` endpoint (the only write path
besides login adoption, which copies an already-validated cookie value after
re-checking it against `settings.LANGUAGES`). No DB-level `choices` constraint, so
adding a language later is a settings-only change (FR-012).

**State transitions**:

```text
''  ──(explicit choice while signed in)──────────────▶ '<code>'
''  ──(first sign-in with a device cookie present)───▶ '<code>'   (FR-015 adoption)
'<code>' ──(explicit choice while signed in)─────────▶ '<other code>'
'<code>' ──(sign-in)──────────▶ unchanged; overwrites the device cookie instead
```

**Migration**: one additive migration on `chat.User` (next free number), default
`''`, no data migration, reversible.

## Non-DB data

- **Supported languages** — configuration, not data: `settings.LANGUAGES`
  (`en`, `it` at launch). The selector renders endonyms via
  `translation.get_language_info(code)['name_local']` (FR-013).
- **Interface text catalog** — gettext files under `locale/it/LC_MESSAGES/`
  (`django.po` committed, compiled `django.mo` also committed — no build step).
  English is the source language embedded in code/templates; a missing `msgstr`
  falls back to English automatically (FR-007).
- **Device language choice** — the standard Django language cookie
  (`django_language`), written by the `set_language` view and refreshed at login
  when the account has a saved preference. Not modelled in the DB (FR-006).
- **Product-created default content** (starter agent, default personas): defined
  in `chat/defaults.py` as `gettext_noop`-marked source strings; materialised into
  ordinary Agent/Persona rows via `gettext()` at creation time (FR-014). After
  creation they are indistinguishable from user-authored rows — deliberately so
  (FR-010).
