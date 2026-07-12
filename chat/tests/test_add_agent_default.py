"""US2: adding a blank agent column defaults to DeepSeek 4 Flash."""

from django.test import TestCase
from django.urls import reverse

from chat.views import create_session
from chat.models import User


class AddAgentDefaultModelTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            email='adder@strophae.test', password='x', name='Adder Tester')
        self.client.force_login(self.user)
        self.conv = create_session(self.user)

    def test_added_agent_defaults_to_deepseek_4_flash(self) -> None:
        resp = self.client.post(reverse('add_agent', args=[self.conv.id]))

        self.assertIn(resp.status_code, (200, 204))
        new_agent = self.conv.agents.order_by('order').last()
        assert new_agent is not None
        self.assertEqual(new_agent.model, 'DeepSeek 4 Flash')
        self.assertEqual(new_agent.model_slug, 'deepseek/deepseek-v4-flash')
