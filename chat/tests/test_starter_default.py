"""US1: the starter agent seeding a new session defaults to DeepSeek 4 Flash."""

from django.test import TestCase

from chat.views import create_session
from chat.models import User


class StarterAgentDefaultModelTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            email='starter@strophae.test', password='x', name='Starter Tester')

    def test_starter_agent_defaults_to_deepseek_4_flash(self) -> None:
        conv = create_session(self.user)
        agent = conv.agents.get()

        self.assertEqual(agent.model, 'DeepSeek 4 Flash')

    def test_starter_agent_model_slug_resolves(self) -> None:
        conv = create_session(self.user)
        agent = conv.agents.get()

        self.assertEqual(agent.model_slug, 'deepseek/deepseek-v4-flash')
