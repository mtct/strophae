"""002-i18n US1: full-UI Italian rendering, English fallback, verbatim content."""

from django.conf import settings
from django.test import TestCase, override_settings
from django.urls import reverse

from chat.models import Message, User
from chat.views import create_session


class ItalianRenderingTests(TestCase):
    def test_login_page_renders_in_italian_with_device_cookie(self) -> None:
        self.client.cookies[settings.LANGUAGE_COOKIE_NAME] = 'it'

        resp = self.client.get(reverse('login'))

        self.assertContains(resp, 'Bentornato')
        self.assertContains(resp, 'lang="it"')

    def test_english_is_the_default_without_cookie_or_header(self) -> None:
        resp = self.client.get(reverse('login'))

        self.assertContains(resp, 'Welcome back')
        self.assertContains(resp, 'lang="en"')

    @override_settings(LANGUAGES=[('en', 'English'), ('it', 'Italiano'),
                                  ('de', 'Deutsch')])
    def test_language_without_catalog_falls_back_to_english(self) -> None:
        # FR-007/FR-012: 'de' is offered but has no locale/ catalog — every
        # string must fall back to the English source, never a raw msgid.
        self.client.cookies[settings.LANGUAGE_COOKIE_NAME] = 'de'

        resp = self.client.get(reverse('login'))

        self.assertContains(resp, 'Welcome back')
        self.assertContains(resp, 'lang="de"')

    def test_authed_screens_and_toasts_render_in_italian(self) -> None:
        # Quickstart §4 walk: compose screen + an HX-Trigger toast, in Italian.
        user = User.objects.create_user(email='walk@strophae.test',
                                        password='x', name='Walk Tester')
        conv = create_session(user)
        agent = conv.agents.get()
        self.client.force_login(user)
        self.client.cookies[settings.LANGUAGE_COOKIE_NAME] = 'it'

        compose = self.client.get(reverse('compose', args=[conv.id]))
        toast = self.client.post(reverse('save_persona', args=[agent.id]))

        self.assertContains(compose, 'Componi il tuo consiglio')
        self.assertContains(compose, 'Contesto condiviso')
        self.assertIn('salvato nella libreria', toast.headers['HX-Trigger'])

    def test_user_authored_content_is_displayed_verbatim(self) -> None:
        user = User.objects.create_user(email='verbatim@strophae.test',
                                        password='x', name='Verbatim')
        conv = create_session(user)
        agent = conv.agents.get()
        agent.name = 'La Mia Musa Personale'
        agent.system_prompt = 'Answer only in rhyming couplets.'
        agent.save()
        # ASCII-only on purpose: json_script escapes non-ASCII (display-equivalent),
        # which would make a byte-level assertContains miss accented text.
        Message.objects.create(agent=agent, role='user',
                               text='Questo testo resta esattamente uguale.')
        self.client.force_login(user)
        self.client.cookies[settings.LANGUAGE_COOKIE_NAME] = 'it'

        resp = self.client.get(reverse('chat', args=[conv.id]))

        self.assertContains(resp, 'La Mia Musa Personale')
        self.assertContains(resp, 'Answer only in rhyming couplets.')
        self.assertContains(resp, 'Questo testo resta esattamente uguale.')
