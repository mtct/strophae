# HTTP Contracts: Internationalization (i18n) Support

**Feature**: 002-i18n-support | **Date**: 2026-07-12

## New endpoint

### POST `i18n/set-language/` (name: `set_language`)

Plain form POST (not htmx): a language change must re-render the whole page in the
new language anyway, so a full redirect is the correct mechanic.

**Request** (form-encoded):

| Field | Required | Constraints |
|-------|----------|-------------|
| `language` | yes | must be a code present in `settings.LANGUAGES` |
| `next` | no | path to return to; validated with `url_has_allowed_host_and_scheme` |

**Behavior**:

- Valid `language`, signed out → set the standard language cookie; redirect to
  `next` (or `home`). *(FR-003, FR-006)*
- Valid `language`, signed in → set the cookie **and** save `user.language`;
  redirect as above. *(FR-003, FR-004)*
- Invalid/missing `language` → no cookie change, no save; redirect to `next`/`home`
  unchanged (idempotent no-op — there is nothing useful to tell the user beyond the
  page staying in the old language).
- Unsafe `next` → ignored, redirect to `home`.
- GET → `405` (POST-only, matching the repo's `@require_POST` convention).

**Response**: `302` redirect. `Set-Cookie: django_language=<code>` on success.

## Modified endpoints (side effects)

### POST `login/` (`login_view`) and POST `signup/` (`signup_view`)

After a successful `login()` call, apply FR-015 precedence:

1. `user.language` set → response overwrites the device cookie with it
   (account preference wins on this device from now on).
2. `user.language` empty **and** request carries a valid language cookie → persist
   that code to `user.language` (first-sign-in adoption; signup counts).
3. Neither → no change (browser `Accept-Language` detection keeps applying).

Failed logins change nothing.

## Cross-cutting contract (all existing endpoints)

- Every rendered page and htmx partial is emitted in the active request language
  (cookie → `Accept-Language` → English), including validation errors and
  `HX-Trigger` toast strings. *(FR-001, FR-005, FR-011)*
- `Content-Language` response header is set by `LocaleMiddleware`; `<html lang>`
  reflects the active language on full-page responses.
- POST `session/new/` (`new_session`) and POST `c/<id>/agent/add/` (`add_agent`):
  the created starter/blank agent's name and system prompt are materialised in the
  request's active language at creation time; stored content is never re-translated
  afterwards. *(FR-014)*
- User-authored fields echoed back in any response (titles, names, prompts,
  messages) pass through verbatim. *(FR-010)*

## UI contract (language selector placement)

- **Signed in**: selector in the user menu (`base.html`) and a Language section on
  the settings screen; both submit the `set_language` form.
- **Signed out**: compact selector on `login.html`; submits the same form.
- Each option is labelled with the language's endonym (`English`, `Italiano`).
  *(FR-013)*
