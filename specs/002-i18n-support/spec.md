# Feature Specification: Internationalization (i18n) Support

**Feature Branch**: `002-i18n-support`  
**Created**: 2026-07-12  
**Status**: Draft  
**Input**: User description: "l'applicazione deve supportare l'internazionalizzazione"

## Clarifications

### Session 2026-07-12

- Q: In what language should product-created named content (the starter agent of a new draft, default personas and their prompts) be created? → A: In the user's interface language at creation time; from then on it is user content and is never re-translated.
- Q: When a visitor picks a language while signed out and then signs in to an account with a different saved preference, which wins? → A: The account preference wins after sign-in; if the account has no saved preference yet, the device choice is adopted as the account preference at first sign-in.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use the app in my preferred language (Priority: P1)

A user opens the language selector, picks their preferred language (e.g. Italian),
and from that moment every part of the product interface — navigation, sidebar,
compose screen, chat screen, settings, buttons, form labels, notifications, and
error messages — appears in that language. The choice sticks: when the user signs
in again later, even from another device, the app is still in their chosen language.

**Why this priority**: This is the core of the request. Without a working language
switch that covers the whole interface and persists, there is no internationalization
to speak of. On its own it delivers the full essential value.

**Independent Test**: Sign in, switch the language to Italian, navigate every screen
and trigger a notification and a validation error; all interface text reads in
Italian. Sign out, sign back in (or from a second device): the app is still in
Italian.

**Acceptance Scenarios**:

1. **Given** a signed-in user viewing the app in English, **When** they select Italian in the language selector, **Then** all interface text on the current and every subsequent screen is shown in Italian.
2. **Given** a user who previously chose Italian, **When** they sign in from a different device, **Then** the app is presented in Italian without any re-selection.
3. **Given** a user viewing the app in Italian, **When** an action triggers a confirmation or error message, **Then** that message appears in Italian.
4. **Given** a conversation containing messages and agent names written by the user, **When** the interface language is changed, **Then** that user-authored content is displayed exactly as written, untranslated.

---

### User Story 2 - First visit in my browser's language (Priority: P2)

A visitor who has never used the app (or is not signed in) arrives at the sign-in
page. The app detects the language their browser asks for and, if it is a supported
language, presents itself in it; otherwise it falls back to English. If the visitor
manually picks a language while signed out, that choice is remembered on that
browser.

**Why this priority**: First impressions for new users — an Italian visitor should
see an Italian sign-in page without hunting for a switch. It builds on the language
infrastructure of Story 1 but is separately testable and valuable.

**Independent Test**: With a browser configured to prefer Italian, open the app
while signed out; the sign-in page is in Italian. With a browser preferring an
unsupported language (e.g. French), the page is in English.

**Acceptance Scenarios**:

1. **Given** a signed-out visitor whose browser prefers Italian, **When** they open the app, **Then** the sign-in page appears in Italian.
2. **Given** a signed-out visitor whose browser prefers an unsupported language, **When** they open the app, **Then** the sign-in page appears in English.
3. **Given** a signed-out visitor who manually switches the page to English, **When** they return later on the same browser, **Then** the page is in English regardless of the browser's preferred language.
4. **Given** a signed-out visitor who chose Italian on this browser, **When** they sign in to an account whose saved preference is English, **Then** the app switches to English.
5. **Given** a signed-out visitor who chose Italian on this browser, **When** they sign in to an account that has no saved language preference yet, **Then** Italian becomes that account's saved preference.

---

### User Story 3 - Dates, times and quantities follow my language (Priority: P3)

A user whose interface is in Italian sees dates, times, relative date groupings in
the conversation sidebar (e.g. "Oggi", "Ieri"), and any counted quantities formatted
and pluralized according to Italian conventions — and likewise for every other
supported language.

**Why this priority**: Correct locale formatting completes the experience but the
product remains usable without it; raw interface translation (Stories 1–2) matters
more.

**Independent Test**: Switch the interface to Italian and inspect the conversation
sidebar and any timestamps: group labels, date and time formats follow Italian
conventions; labels with counts use correct Italian plural forms.

**Acceptance Scenarios**:

1. **Given** the interface set to Italian, **When** the user views the conversation sidebar, **Then** date group labels and any displayed dates/times follow Italian conventions.
2. **Given** the interface set to Italian, **When** a label includes a quantity (one item vs. several), **Then** the correct Italian singular/plural form is used.

---

### Edge Cases

- A translation is missing for a given piece of text in the selected language: the English text is shown — never an internal identifier, placeholder code, or blank space.
- The browser requests an unsupported language: the app falls back to English.
- A translated label is significantly longer than its English counterpart: the layout accommodates it without truncating meaning or breaking the screen.
- The user changes language mid-session: all subsequently rendered interface text, including notifications and error messages, uses the new language; previously written user content is untouched.
- Two members of the same workspace use different languages: each sees the product interface in their own language, while shared user-authored content (persona names, prompts) reads identically for both.
- Model names and brand names (e.g. product name, model labels) are not translated in any language.
- The user changes interface language after their starter agent or default personas were created: that content keeps the language it was created in, like any other user content.
- A device-level language choice conflicts with the account preference at sign-in: the account preference wins; the device choice is only adopted when the account has none yet (FR-015).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All product interface text — navigation, buttons, form labels, placeholders, headings, empty states, notifications, confirmation and error messages — MUST be available in every supported language.
- **FR-002**: The product MUST launch with English and Italian as supported languages, with English as the default and fallback language.
- **FR-003**: Users MUST be able to change the display language from within the app at any time, both while signed in and while signed out.
- **FR-004**: A signed-in user's language choice MUST be saved to their account and applied on every subsequent visit, from any device.
- **FR-005**: A visitor who has not yet chosen a language MUST see the app in their browser's preferred language when it is supported, and in English otherwise.
- **FR-006**: A language choice made while signed out MUST be remembered on that browser/device.
- **FR-007**: When a translation is missing for a piece of interface text, the English text MUST be displayed in its place.
- **FR-008**: Dates, times, and relative date groupings MUST follow the conventions of the selected language.
- **FR-009**: Interface text containing quantities MUST use the plural form rules of the selected language.
- **FR-010**: User-generated content (conversation titles, messages, persona and agent names, system prompts) and AI-generated replies MUST be displayed exactly as authored and never translated by the product.
- **FR-011**: Feedback produced in response to user actions (success notifications, validation and error messages) MUST appear in the user's selected language.
- **FR-012**: Adding a new supported language MUST require only providing the translated text, with no change to any feature's behavior.
- **FR-013**: The language selector MUST present each available language in that language's own name (e.g. "Italiano", "English").
- **FR-014**: Named content the product creates on the user's behalf (the starter agent of a new draft, default personas, and their prompts) MUST be created in the user's interface language active at creation time; once created it is user content per FR-010 and is never re-translated.
- **FR-015**: On sign-in, the account's saved language preference MUST take precedence over any choice made on the device while signed out; if the account has no saved preference yet, the device choice (when present) MUST be adopted as the account preference at that first sign-in.

### Key Entities

- **User language preference**: the language a signed-in user has chosen, stored with their account and applied everywhere they sign in.
- **Supported language**: a language the product offers, with an identifying code and a self-referential display name; the set is expected to grow over time.
- **Interface text catalog**: the complete collection of translatable product interface strings, maintained once per supported language.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of interface text across all screens appears in the selected language for every supported language; no untranslated strings or internal identifiers are visible to users.
- **SC-002**: A user can change the display language in 3 or fewer interactions from any screen, and the change is reflected on the very next screen they see.
- **SC-003**: A signed-in user's language choice survives sign-out, sign-in, and device changes with zero re-selections needed.
- **SC-004**: First-time visitors whose browser prefers a supported language see the app in that language on their first page view.
- **SC-005**: A new language can be added to the product by supplying translations alone, with zero regressions in existing feature behavior.
- **SC-006**: All dates, times, and pluralized labels follow the conventions of the selected language on every screen where they appear.

## Assumptions

- Initial supported languages are **English** (default and fallback) and **Italian**, chosen because the current product is in English and the requesting team works in Italian; the set is designed to grow.
- Only the product's own interface text is translated. User-generated content (messages, conversation titles, persona/agent names and prompts) and AI-generated replies are displayed as-is; translating them is out of scope.
- The language an AI agent answers in is driven by the user's prompt and the agent's configured instructions, not by the interface language; steering agent reply language is out of scope for this feature.
- Right-to-left languages are out of scope for this release (both initial languages are left-to-right); adding one later would be a separate effort covering layout direction.
- Seeded demo content (demo personas, sample conversations) is treated as user content and is not translated.
- Product, brand, and model names (e.g. "strophae", model labels) remain untranslated in all languages.
