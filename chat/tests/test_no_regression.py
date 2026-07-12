"""SC-004: changing the blank-agent default is NOT retroactive.

Personas, shared personas, and the seeded demo agents keep their explicitly
configured models; only the neutral starter/blank agents adopt the new default.
"""

from django.test import TestCase

from chat import defaults


class NoRegressionModelTests(TestCase):
    def test_seeded_demo_agents_keep_their_explicit_models(self) -> None:
        by_persona = {a['persona_type']: a['model'] for a in defaults.DEFAULT_AGENTS}
        self.assertEqual(by_persona['analyst'], 'GPT-4o')
        self.assertEqual(by_persona['muse'], 'Claude Opus 4.1')
        self.assertEqual(by_persona['critic'], 'Gemini 2.5 Pro')
        self.assertEqual(by_persona['coder'], 'Llama 3.3 70B')

    def test_shared_personas_keep_their_explicit_models(self) -> None:
        models = {p['name']: p['model'] for p in defaults.SHARED_PERSONAS}
        self.assertEqual(models['Brand voice'], 'Claude Sonnet 4')
        self.assertEqual(models['Legal reviewer'], 'GPT-4o')
        self.assertEqual(models['Data scientist'], 'Gemini 2.5 Pro')

    def test_only_the_neutral_starter_adopts_the_new_default(self) -> None:
        self.assertEqual(defaults.DEFAULT_AGENT['model'], 'DeepSeek 4 Flash')
