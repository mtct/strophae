"""Seed data and colour helpers ported from the Strophae design prototype."""

from typing import Any, TypedDict

from django.utils.translation import gettext, gettext_noop

ACCENT_CHROMA = 0.15


class DemoUser(TypedDict):
    id_hint: str
    name: str
    email: str
    hue: int
    role: str


def accent(hue: int) -> str:
    return f'oklch(0.58 {ACCENT_CHROMA} {hue})'


def soft(hue: int) -> str:
    return f'oklch(0.965 {ACCENT_CHROMA * 0.3} {hue})'


def header_bg(hue: int) -> str:
    return f'oklch(0.992 {ACCENT_CHROMA * 0.12} {hue})'


# The single neutral agent that seeds every new session — a blank slate the user
# shapes from scratch (or replaces with personas from the library). Name and
# prompt are gettext_noop-marked source strings: they are materialised in the
# user's interface language at creation time via localized_agent() (FR-014),
# after which the stored row is ordinary user content and never re-translated.
DEFAULT_AGENT: dict[str, Any] = {
    'name': gettext_noop('Simple Jack'),
    'hue': 255, 'model': 'DeepSeek 4 Flash', 'persona_type': 'generic',
    'system_prompt': gettext_noop(
        'You are a helpful, neutral assistant. Answer clearly and '
        'directly, without a strong persona of your own.'),
}


def localized_agent(config: dict[str, Any]) -> dict[str, Any]:
    """Materialise a default agent config in the active request language."""
    return {**config, 'name': gettext(config['name']),
            'system_prompt': gettext(config['system_prompt'])}

# The four personas used to seed the demo account's history (see seed.py).
DEFAULT_AGENTS = [
    {'name': 'Analyst', 'hue': 255, 'model': 'GPT-4o', 'persona_type': 'analyst',
     'system_prompt': 'You are a rigorous analyst. Break problems into structured '
                      'parts and weigh the trade-offs explicitly.'},
    {'name': 'Muse', 'hue': 310, 'model': 'Claude Opus 4.1', 'persona_type': 'muse',
     'system_prompt': 'You are a poetic, imaginative thinker. Respond with vivid, '
                      'lateral, lyrical reasoning.'},
    {'name': 'Critic', 'hue': 60, 'model': 'Gemini 2.5 Pro', 'persona_type': 'critic',
     'system_prompt': 'You are a sharp skeptic. Challenge assumptions and surface the '
                      'risks others miss.'},
    {'name': 'Maker', 'hue': 150, 'model': 'Llama 3.3 70B', 'persona_type': 'coder',
     'system_prompt': 'You are a pragmatic engineer. Give concrete, technical, '
                      'actionable answers.'},
]

# Demo accounts (password is "demo" for all).
DEMO_USERS: list[DemoUser] = [
    {'id_hint': 'alex', 'name': 'Alex Rivera', 'email': 'alex@strophae.app',
     'hue': 255, 'role': 'Admin'},
    {'id_hint': 'sam', 'name': 'Sam Okafor', 'email': 'sam@strophae.app',
     'hue': 150, 'role': 'Member'},
    {'id_hint': 'mei', 'name': 'Mei Tanaka', 'email': 'mei@strophae.app',
     'hue': 310, 'role': 'Member'},
]

SHARED_PERSONAS = [
    {'name': 'Brand voice', 'hue': 30, 'model': 'Claude Sonnet 4', 'persona_type': 'muse',
     'system_prompt': 'You write in our brand voice: warm, concise, a little witty. '
                      'Never corporate.', 'author_name': 'Alex Rivera'},
    {'name': 'Legal reviewer', 'hue': 255, 'model': 'GPT-4o', 'persona_type': 'critic',
     'system_prompt': 'You flag legal and compliance risks in plain language and name '
                      'the clause at issue.', 'author_name': 'Sam Okafor'},
    {'name': 'Data scientist', 'hue': 200, 'model': 'Gemini 2.5 Pro', 'persona_type': 'analyst',
     'system_prompt': 'You reason quantitatively, propose metrics, and check for bias '
                      'before concluding.', 'author_name': 'Mei Tanaka'},
]

# Personas seeded for the demo "Alex" account's personal library.
SEED_PERSONAS = [
    {'name': 'Researcher', 'hue': 200, 'model': 'Gemini 2.5 Pro', 'persona_type': 'analyst',
     'system_prompt': 'You are a meticulous researcher. Separate fact from inference, '
                      'show your reasoning, and flag uncertainty explicitly.'},
    {'name': 'Editor', 'hue': 30, 'model': 'Claude Sonnet 4', 'persona_type': 'critic',
     'system_prompt': "You are a sharp copy editor. Tighten prose, cut filler, and "
                      "preserve the author's voice."},
    {'name': "Devil's advocate", 'hue': 0, 'model': 'GPT-4o', 'persona_type': 'critic',
     'system_prompt': 'You argue the strongest opposing case in good faith, exposing '
                      'weak assumptions and blind spots.'},
    {'name': 'Strategist', 'hue': 160, 'model': 'o3', 'persona_type': 'analyst',
     'system_prompt': 'You think in terms of user value, trade-offs and sequencing. '
                      'Be concrete and decisive.'},
]

# (title, hours_ago, persona keys, prompt) for Alex's seeded conversation history.
SEED_CONVERSATIONS = [
    ('Pricing the Pro tier', 2, ['analyst', 'critic', 'coder'],
     'How should we price the Pro tier without cannibalising Team?'),
    ('Naming the onboarding flow', 27, ['muse', 'critic'],
     'Give me five name options for the first-run onboarding.'),
    ('Websocket reconnect bug', 4 * 24, ['coder', 'analyst'],
     'Why does the socket drop every few minutes under load?'),
    ('Essay outline: attention', 12 * 24, ['muse', 'analyst', 'critic'],
     'Outline an essay on attention in the age of feeds.'),
]

# Map a persona key -> the default agent config (used when seeding conversations).
AGENT_BY_PERSONA = {a['persona_type']: a for a in DEFAULT_AGENTS}

# Canned assistant replies, keyed by persona — used only to seed history so the
# demo account has something to look at. Live chat uses real OpenRouter streaming.
SEED_REPLIES = {
    'analyst': "Let's break this down. Three forces are in tension here — cost, time "
               "and risk — and they pull in different directions. I'd optimise for the "
               "one that's hardest to reverse, and treat the rest as adjustable.",
    'muse': "Think of it less as a problem and more as a doorway. The interesting "
            "answers live just past the obvious one, where certainty starts to blur "
            "into possibility — that's the direction I'd lean toward.",
    'critic': "I'd push back on the premise. You're treating the goal as fixed, but "
              "most of the failure here comes from optimising the wrong thing in the "
              "first place. Pressure-test that before anything else.",
    'coder': "Concretely: build the smallest version that runs end-to-end, then harden "
             "only the parts that actually break. Don't abstract until you've felt the "
             "same pain twice.",
    'generic': "Here's how I'd approach it: get the core working first, keep the scope "
               "tight, and iterate on what you learn rather than what you assumed.",
}
