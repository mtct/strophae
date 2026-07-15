"""002-i18n: contract tests for the set_language endpoint (contracts/http.md)."""

from django.conf import settings
from django.test import TestCase
from django.urls import reverse

from chat.models import User


class SetLanguageEndpointTests(TestCase):
    def test_signed_out_sets_cookie_and_redirects_to_next(self) -> None:
        resp = self.client.post(reverse('set_language'),
                                {'language': 'it', 'next': reverse('login')})

        self.assertEqual(resp.status_code, 302)
        self.assertEqual(resp.headers['Location'], reverse('login'))
        self.assertEqual(resp.cookies[settings.LANGUAGE_COOKIE_NAME].value, 'it')

    def test_signed_in_saves_account_preference_and_sets_cookie(self) -> None:
        user = User.objects.create_user(email='lang@strophae.test', password='x')
        self.client.force_login(user)

        resp = self.client.post(reverse('set_language'), {'language': 'it'})

        user.refresh_from_db()
        self.assertEqual(user.language, 'it')
        self.assertEqual(resp.cookies[settings.LANGUAGE_COOKIE_NAME].value, 'it')

    def test_invalid_code_changes_nothing(self) -> None:
        user = User.objects.create_user(email='lang2@strophae.test', password='x')
        self.client.force_login(user)

        resp = self.client.post(reverse('set_language'),
                                {'language': 'xx', 'next': reverse('login')})

        user.refresh_from_db()
        self.assertEqual(resp.status_code, 302)
        self.assertEqual(user.language, '')
        self.assertNotIn(settings.LANGUAGE_COOKIE_NAME, resp.cookies)

    def test_missing_code_changes_nothing(self) -> None:
        resp = self.client.post(reverse('set_language'), {'next': reverse('login')})

        self.assertEqual(resp.status_code, 302)
        self.assertNotIn(settings.LANGUAGE_COOKIE_NAME, resp.cookies)

    def test_unsafe_next_falls_back_to_home(self) -> None:
        resp = self.client.post(reverse('set_language'),
                                {'language': 'it', 'next': 'https://evil.example/'})

        self.assertEqual(resp.status_code, 302)
        self.assertEqual(resp.headers['Location'], reverse('home'))

    def test_get_is_not_allowed(self) -> None:
        resp = self.client.get(reverse('set_language'))

        self.assertEqual(resp.status_code, 405)
