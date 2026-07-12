"""002-i18n US1 / FR-014: product-created content is born in the active language."""

from django.conf import settings
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from django.utils import translation
from django.utils.translation import gettext

from chat import defaults
from chat.models import Persona, User
from chat.views import create_session


class CreationLanguageTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            email='born@strophae.test', password='x', name='Born Tester')

    def test_starter_agent_is_born_in_the_active_language(self) -> None:
        with translation.override('it'):
            conv = create_session(self.user)
            expected_prompt = gettext(defaults.DEFAULT_AGENT['system_prompt'])

        agent = conv.agents.get()
        self.assertEqual(agent.system_prompt, expected_prompt)
        # The catalog must actually translate it — otherwise FR-014 is vacuous.
        self.assertNotEqual(agent.system_prompt,
                            defaults.DEFAULT_AGENT['system_prompt'])
        with translation.override('it'):
            self.assertEqual(conv.title, gettext('New session'))
            self.assertNotEqual(conv.title, 'New session')

    def test_created_content_is_frozen_after_a_language_switch(self) -> None:
        with translation.override('it'):
            conv = create_session(self.user)
        agent = conv.agents.get()
        born_prompt = agent.system_prompt

        with translation.override('en'):
            agent.refresh_from_db()

        self.assertEqual(agent.system_prompt, born_prompt)

    def test_new_session_view_uses_the_request_language(self) -> None:
        self.client.force_login(self.user)
        self.client.cookies[settings.LANGUAGE_COOKIE_NAME] = 'it'

        resp = self.client.post(reverse('new_session'))

        conv = self.user.conversations.latest('created_at')
        agent = conv.agents.get()
        self.assertEqual(resp.status_code, 302)
        self.assertNotEqual(agent.system_prompt,
                            defaults.DEFAULT_AGENT['system_prompt'])

    def test_blank_added_agent_name_is_localized(self) -> None:
        self.client.force_login(self.user)
        conv = create_session(self.user)
        self.client.cookies[settings.LANGUAGE_COOKIE_NAME] = 'it'

        resp = self.client.post(reverse('add_agent', args=[conv.id]))

        self.assertEqual(resp.status_code, 200)
        added = conv.agents.latest('id')
        with translation.override('it'):
            expected = gettext('Agent %(n)s') % {'n': 2}
        self.assertEqual(added.name, expected)
        self.assertNotEqual(added.name, 'Agent 2')

    def test_seed_data_stays_english_whatever_the_active_language(self) -> None:
        with translation.override('it'):
            call_command('seed')

        alex = User.objects.get(email='alex@strophae.app')
        self.assertTrue(
            Persona.objects.filter(owner=alex, name='Researcher').exists())
        self.assertTrue(
            alex.conversations.filter(title='Pricing the Pro tier').exists())
