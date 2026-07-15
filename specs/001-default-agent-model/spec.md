# Feature Specification: Default Agent Model — DeepSeek 4 Flash

**Feature Branch**: `001-default-agent-model`  
**Created**: 2026-07-01  
**Status**: Draft  
**Input**: User description: "il modello utilizzato di default dagli agenti è deepseek 4 flash"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - New blank agent defaults to DeepSeek 4 Flash (Priority: P1)

When a user starts a fresh chat session, the starter agent that seeds the session
uses **DeepSeek 4 Flash** as its model instead of the previous default. The user can
still change the model per agent, but if they never touch the model selector, the agent
runs on DeepSeek 4 Flash.

**Why this priority**: This is the core of the request — it changes the out-of-the-box
behaviour every user sees on their very first session and on every new draft, so it must
be correct before anything else. On its own it delivers the full intended value.

**Independent Test**: Start a new session (or open a new draft) as any user and inspect
the starter agent's model without changing any selector; it reads "DeepSeek 4 Flash".

**Acceptance Scenarios**:

1. **Given** a user with no active draft, **When** they begin a new chat session, **Then** the automatically-created starter agent shows "DeepSeek 4 Flash" as its selected model.
2. **Given** a fresh starter agent on DeepSeek 4 Flash, **When** the user sends a prompt without touching the model selector, **Then** the agent's answer is produced by the DeepSeek 4 Flash model.

---

### User Story 2 - Adding another agent column defaults to DeepSeek 4 Flash (Priority: P2)

When a user adds an additional agent column to a conversation without picking a model,
the new column also defaults to **DeepSeek 4 Flash**, keeping the default consistent
everywhere a blank agent is created.

**Why this priority**: Adding columns is the second place a "blank" agent is created;
leaving it on the old default would make the default inconsistent and confusing, but the
feature still delivers value from Story 1 alone.

**Independent Test**: In an existing conversation, add a new agent column and inspect its
model without changing the selector; it reads "DeepSeek 4 Flash".

**Acceptance Scenarios**:

1. **Given** an existing conversation, **When** the user adds a new agent column, **Then** the new column's default model is "DeepSeek 4 Flash".

---

### User Story 3 - DeepSeek 4 Flash is selectable in the model picker (Priority: P3)

Because a blank agent now defaults to DeepSeek 4 Flash, that model must be a valid,
selectable option in the per-agent model selector so users can also re-select it after
switching away, and so the default is never an "unknown" model.

**Why this priority**: Supports Stories 1 and 2 — the default must be a real, offered
choice — but is a small enabling change rather than the headline behaviour.

**Independent Test**: Open the model selector on any agent; "DeepSeek 4 Flash" appears in
the list of available models and can be chosen.

**Acceptance Scenarios**:

1. **Given** any agent's model selector, **When** the user opens it, **Then** "DeepSeek 4 Flash" is listed as an available option.
2. **Given** an agent switched to a different model, **When** the user selects "DeepSeek 4 Flash" again, **Then** the agent is set back to that model and answers are produced by it.

---

### Edge Cases

- **Existing conversations/agents**: Agents that were already created on the previous
  default keep their stored model; the new default applies only to blank agents created
  after this change.
- **Personas and seeded agents**: Personas, shared personas, and seeded demo agents that
  explicitly declare a model keep their declared model — the new default only fills the
  "no explicit choice" case.
- **Model unavailable at run time**: If the DeepSeek 4 Flash model cannot be reached
  during a live turn, the user sees the standard per-agent streaming error for that
  column, unchanged from other models.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The starter agent that seeds a new chat session MUST default to the
  "DeepSeek 4 Flash" model.
- **FR-002**: A newly added blank agent column MUST default to the "DeepSeek 4 Flash"
  model.
- **FR-003**: "DeepSeek 4 Flash" MUST be a selectable option in the per-agent model
  selector.
- **FR-004**: Selecting "DeepSeek 4 Flash" MUST route live turns for that agent to the
  corresponding DeepSeek 4 Flash model provider.
- **FR-005**: The change MUST NOT alter the stored model of agents, personas, or seeded
  data that already have an explicitly chosen model.
- **FR-006**: Users MUST still be able to change any agent's model away from the default
  at any time, exactly as before.

### Key Entities *(include if feature involves data)*

- **Agent**: A single column in a conversation, characterised by (among other fields) a
  chosen model. The "default model" is the value this field takes when a blank agent is
  created without an explicit model choice.
- **Model option**: A user-facing model label offered in the selector, backed by a
  concrete provider model used for live answers. "DeepSeek 4 Flash" must exist as such an
  option.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of newly started sessions present a starter agent whose default model
  is "DeepSeek 4 Flash".
- **SC-002**: 100% of newly added blank agent columns default to "DeepSeek 4 Flash".
- **SC-003**: "DeepSeek 4 Flash" is present and selectable in the model list for every
  agent, and a turn run on it returns a live answer.
- **SC-004**: 0 existing agents/personas change their model as a result of this change
  (no unintended retroactive edits).

## Assumptions

- "DeepSeek 4 Flash" is the intended user-facing model label; it is added as a new
  offered model and mapped to the appropriate DeepSeek provider model for live streaming.
- The previously offered DeepSeek option ("DeepSeek V3") remains available in the selector
  unless the user later asks to remove it; this change only adds the new default option.
- The new default applies only to blank agents created after the change; existing stored
  conversations, agents, personas, and seeded demo data are unchanged.
- No data migration is required, because the change affects only the default used at
  creation time, not persisted rows.
- The model-selection, streaming, and error-handling flow is otherwise unchanged; only
  the default label (and the set of offered options) is affected.
