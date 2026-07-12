# Tasks: Internationalization (i18n) Support

**Input**: Design documents from `/specs/002-i18n-support/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http.md, quickstart.md

**Tests**: MANDATORY per Constitution Principle II (Test-First Coverage). Every task
group below writes its failing pytest module BEFORE the implementation it covers.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Wire Django's i18n machinery into the project — everything else builds on this.

- [x] T001 Configure i18n in config/settings.py: `LANGUAGE_CODE = 'en'`, `LANGUAGES = [('en', 'English'), ('it', 'Italiano')]`, `LOCALE_PATHS = [BASE_DIR / 'locale']`, insert `django.middleware.locale.LocaleMiddleware` between Session and Common middleware, add `django.template.context_processors.i18n` to context processors (research R1/R2)
- [x] T002 Create the `locale/` directory scaffold and verify the gettext toolchain: `brew install gettext` if missing, then `uv run python manage.py makemessages -l it --no-obsolete` produces locale/it/LC_MESSAGES/django.po (quickstart)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The account-preference field and the language-change endpoint that both US1 and US2 depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 [P] Write failing pytest contract tests for the `set_language` endpoint in chat/tests/test_i18n_set_language.py: valid code signed-out → cookie + 302; valid code signed-in → cookie + `user.language` saved; invalid code → no-op redirect; unsafe `next` → redirect to home; GET → 405 (contracts/http.md)
- [x] T004 [P] Add `language = models.CharField(max_length=10, blank=True, default='')` to `User` in chat/models.py and generate the additive migration in chat/migrations/ (data-model.md)
- [x] T005 Implement the `set_language` FBV in chat/views.py (validate against `settings.LANGUAGES`, set the language cookie, persist `user.language` when authenticated, `url_has_allowed_host_and_scheme` on `next`) and wire `path('i18n/set-language/', ...)` in chat/urls.py; T003 tests must pass (depends on T003, T004)
- [x] T006 [P] Scaffold templates/base.html for i18n: `{% load i18n %}` and `<html lang="{{ LANGUAGE_CODE }}">` (research R5)

**Checkpoint**: endpoint contract green — user story implementation can begin.

---

## Phase 3: User Story 1 - Use the app in my preferred language (Priority: P1) 🎯 MVP

**Goal**: A signed-in user switches to Italian and the entire interface — every screen, toast and error — renders in Italian; the choice is saved to the account and survives sign-out/device changes. Product-created defaults (starter agent, personas) are born in the active language (FR-001..004, FR-007, FR-010..014).

**Independent Test**: Switch to Italian, walk every screen and trigger a toast + a validation error (all Italian, user content untouched); sign out and back in from a fresh client — still Italian; start a new session — the starter agent is born Italian.

### Tests for User Story 1 (MANDATORY) ⚠️ — write first, must fail

- [x] T007 [P] [US1] Write failing rendering tests in chat/tests/test_i18n_rendering.py: known UI string renders in Italian with cookie `it`; untranslated string falls back to English (FR-007); `<html lang>` matches active language; user-authored agent name/message text is echoed verbatim under `it` (FR-010)
- [x] T008 [P] [US1] Write failing persistence tests in chat/tests/test_i18n_precedence.py: signed-in language change saves `user.language`; login with `user.language='it'` refreshes the device cookie to `it` (account wins — FR-004/SC-003)
- [x] T009 [P] [US1] Write failing creation-language tests in chat/tests/test_i18n_defaults.py: new session under `it` creates the starter agent with Italian name/prompt; switching the UI back to `en` leaves that agent's text unchanged (FR-014); `manage.py seed` output is English regardless of active language

### Implementation for User Story 1

- [x] T010 [US1] In chat/views.py `login_view`/`signup_view`: after successful `login()`, if `user.language` is set, write it to the language cookie on the response (account preference wins on this device)
- [x] T011 [P] [US1] Translate-sweep templates/base.html and templates/chat/_app.html: wrap all interface text in `{% translate %}`/`{% blocktranslate %}`, move JS-generated strings (API-key store, clipboard/toast text) into an `i18n-strings` `json_script` dict read by the Alpine components
- [x] T012 [P] [US1] Translate-sweep templates/chat/compose.html, templates/chat/partials/agent_card.html and templates/chat/partials/library_modal.html
- [x] T013 [P] [US1] Translate-sweep templates/chat/chat.html including Alpine markup; add its JS-generated strings (streaming error, "Thinking…", finalize failures) to the `i18n-strings` `json_script`
- [x] T014 [P] [US1] Translate-sweep templates/chat/login.html, templates/chat/settings.html, templates/chat/members.html and templates/chat/partials/members_list.html
- [x] T015 [US1] Localize all view-produced strings in chat/views.py with `gettext` (`_toast` call sites, login/signup/invite validation errors, any literal strings surfaced to users — FR-011)
- [x] T016 [US1] Mark `DEFAULT_AGENT`/`DEFAULT_AGENTS` names and system prompts with `gettext_noop` in chat/defaults.py, add a materialise-with-`gettext()` helper, call it from `create_session` and blank `add_agent` in chat/views.py, and wrap seeding in `translation.override('en')` in chat/management/commands/seed.py (research R7)
- [x] T017 [US1] Add the signed-in language selector: user-menu entry in templates/base.html and a Language section in templates/chat/settings.html, both posting to `set_language` with endonym labels from `translation.get_language_info` (FR-013, contracts UI section)
- [x] T018 [US1] Extract and author the Italian catalog: `makemessages -l it --no-obsolete`, translate all msgids (UI strings + default agent/persona strings) in locale/it/LC_MESSAGES/django.po, `compilemessages`, commit both .po and .mo; T007–T009 must pass

**Checkpoint**: US1 fully functional — the app is usable end-to-end in Italian with a persistent account preference.

---

## Phase 4: User Story 2 - First visit in my browser's language (Priority: P2)

**Goal**: Signed-out visitors get browser-language detection with English fallback, can pick a language that sticks on the device, and the device choice is adopted into the account at first sign-in — account preference wins thereafter (FR-005/006/015).

**Independent Test**: With `Accept-Language: it` and no cookie, the login page is Italian; with `fr` it is English; a manual pick sticks across reloads; first sign-in adopts the device choice into the account, later sign-ins ignore the device cookie.

**Note**: browser detection itself ships with T001 (`LocaleMiddleware`); this phase adds the signed-out UI and the adoption rule. Full Italian text on the login page comes from US1's T014/T018.

### Tests for User Story 2 (MANDATORY) ⚠️ — write first, must fail

- [x] T019 [P] [US2] Extend chat/tests/test_i18n_precedence.py with failing tests: `Accept-Language: it` + no cookie → Italian login page; unsupported `Accept-Language: fr` → English (FR-005); signed-out cookie choice overrides browser language (FR-006); first sign-in with cookie and empty `user.language` adopts the cookie (login and signup — FR-015); sign-in with `user.language` set ignores a conflicting device cookie (spec US2 scenarios 1–5)

### Implementation for User Story 2

- [x] T020 [US2] Implement FR-015 adoption in chat/views.py `login_view` and `signup_view`: when `user.language` is empty and the request carries a valid language cookie, persist that code to `user.language` (the elif branch after T010's account-wins branch)
- [x] T021 [US2] Add the signed-out language selector to templates/chat/login.html (compact footer control, endonym labels, posts to `set_language` with `next` back to the login page); T019 must pass

**Checkpoint**: US1 and US2 both work independently — detection, device choice, adoption and precedence are all enforced.

---

## Phase 5: User Story 3 - Dates, times and quantities follow my language (Priority: P3)

**Goal**: Sidebar group labels ("Oggi"/"Ieri"/…), relative times and any counted labels follow the active language's conventions and plural rules (FR-008/009).

**Independent Test**: With the UI in Italian, the conversation sidebar shows Italian group labels and relative-time forms; labels with counts use correct Italian singular/plural.

### Tests for User Story 3 (MANDATORY) ⚠️ — write first, must fail

- [x] T022 [P] [US3] Write failing tests in chat/tests/test_i18n_sidebar.py: `conversation_groups` under `translation.override('it')` yields Italian group labels; `_rel_time` returns Italian forms for minutes/hours/days/weeks with correct singular/plural; bucket grouping logic is unchanged by language (stable keys)

### Implementation for User Story 3

- [x] T023 [US3] Localize `_rel_time` in chat/views.py using `gettext`/`ngettext` pattern strings ("just now", "yesterday", "%dm ago" family) so plural rules come from the catalog (research R6)
- [x] T024 [US3] Re-key `conversation_groups` buckets in chat/views.py by stable ids (`today`, `yesterday`, `week`, `earlier`) and translate the display label only at render time
- [x] T025 [US3] (verified no-op: chat.html renders no client-side timestamps — analysis finding U2) Format client-rendered timestamps in templates/chat/chat.html with `Intl.DateTimeFormat(document.documentElement.lang)` so Alpine-rendered times follow the active locale
- [x] T026 [US3] Update the Italian catalog for the new date/plural strings: `makemessages -l it --no-obsolete`, translate, `compilemessages` in locale/it/LC_MESSAGES/; T022 must pass

**Checkpoint**: all three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T027 [P] (done: flexible flex/ellipsis layout absorbs the longer Italian strings — menu min-widths 178/200px vs ~145/170px rendered text; no template changes needed) Visual pass for longer Italian strings on every screen (buttons, column headers, empty states); adjust template layout where text truncates or wraps badly (spec edge case)
- [x] T028 [P] Document the i18n conventions in CLAUDE.md: translation workflow (makemessages/compilemessages, commit .po+.mo), the cookie-sync-at-login design, and the FR-014 creation-time rule
- [x] T029 Run the full quickstart.md manual verification (browser detection, device choice, adoption/precedence, coverage walk, creation language, sidebar)
- [x] T030 Run constitution gates and fix fallout: `uv run ruff check . && uv run ruff format --check .`, `uv run mypy .`, `uv run pytest`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: depends on Phase 2 only
- **US2 (Phase 4)**: depends on Phase 2; scenario "login page fully Italian" additionally needs US1's T014+T018 (catalog), noted in the phase header
- **US3 (Phase 5)**: depends on Phase 2; catalog task T026 is independent of US1's T018
- **Polish (Phase 6)**: depends on all desired user stories

### Within Each User Story

- Test tasks are written FIRST and must fail before their implementation tasks
- chat/views.py tasks in the same phase are sequential (same file): T010 → T015 → T016; T023 → T024
- T018/T026 (catalog authoring) always run LAST in their phase — they need every string already marked

### Parallel Opportunities

- Phase 2: T003, T004, T006 in parallel; T005 after T003+T004
- US1 tests T007, T008, T009 in parallel; template sweeps T011, T012, T013, T014 in parallel (different files)
- After Phase 2, US3 can proceed fully in parallel with US1/US2 (different code paths); US2 can start T019/T020 in parallel with US1 work not touching the same views.py regions — safest sequencing is US1 → US2 for the login_view edits (T010 before T020)

## Parallel Example: User Story 1

```bash
# All US1 test modules together (different files):
Task: "T007 rendering tests in chat/tests/test_i18n_rendering.py"
Task: "T008 persistence tests in chat/tests/test_i18n_precedence.py"
Task: "T009 creation-language tests in chat/tests/test_i18n_defaults.py"

# All template sweeps together (different files):
Task: "T011 base.html + _app.html"
Task: "T012 compose.html + agent_card.html + library_modal.html"
Task: "T013 chat.html + JS i18n-strings"
Task: "T014 login.html + settings.html + members.html + members_list.html"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) → Phase 2 (Foundational)
2. Phase 3 (US1) → **STOP and VALIDATE**: full Italian walk-through per quickstart §4–5
3. This alone delivers the feature's core value (SC-001/002/003)

### Incremental Delivery

1. Setup + Foundational → endpoint + field ready (invisible to users)
2. US1 → app fully usable in Italian with persistent preference (MVP)
3. US2 → first-visit detection + adoption rules
4. US3 → localized dates/plurals
5. Polish → layout pass, docs, gates

## Notes

- Total: 30 tasks — Setup 2, Foundational 4, US1 12, US2 3, US3 5, Polish 4
- [P] tasks = different files, no dependencies on incomplete tasks
- Verify each test module fails before implementing its behavior (Constitution II)
- Commit after each task or logical group; gates (ruff/mypy/pytest) must be green at every checkpoint
