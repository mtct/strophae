"""002-i18n: language precedence at sign-in (FR-004/FR-005/FR-006/FR-015)."""

from django.conf import settings
from django.test import TestCase
from django.urls import reverse

from chat.models import User


class AccountPreferenceLoginTests(TestCase):
    """US1: a saved account preference follows the user to any device."""

    def test_login_applies_account_language_to_this_device(self) -> None:
        User.objects.create_user(email='pref@strophae.test', password='pw',
                                 language='it')

        resp = self.client.post(reverse('login'),
                                {'email': 'pref@strophae.test', 'password': 'pw'})

        self.assertEqual(resp.status_code, 302)
        self.assertEqual(resp.cookies[settings.LANGUAGE_COOKIE_NAME].value, 'it')

    def test_login_without_preference_or_cookie_changes_nothing(self) -> None:
        user = User.objects.create_user(email='nopref@strophae.test', password='pw')

        resp = self.client.post(reverse('login'),
                                {'email': 'nopref@strophae.test', 'password': 'pw'})

        user.refresh_from_db()
        self.assertEqual(resp.status_code, 302)
        self.assertEqual(user.language, '')
        self.assertNotIn(settings.LANGUAGE_COOKIE_NAME, resp.cookies)


class BrowserDetectionTests(TestCase):
    """US2 / FR-005: signed-out visitors get their browser's language.

    Assertions use Content-Language / <html lang> rather than translated text
    so this story stays testable independently of the Italian catalog.
    """

    def test_supported_browser_language_is_used(self) -> None:
        resp = self.client.get(reverse('login'), HTTP_ACCEPT_LANGUAGE='it')

        self.assertEqual(resp.headers['Content-Language'], 'it')
        self.assertContains(resp, 'lang="it"')

    def test_unsupported_browser_language_falls_back_to_english(self) -> None:
        resp = self.client.get(reverse('login'), HTTP_ACCEPT_LANGUAGE='fr')

        self.assertEqual(resp.headers['Content-Language'], 'en')
        self.assertContains(resp, 'lang="en"')

    def test_device_cookie_overrides_browser_language(self) -> None:
        self.client.cookies[settings.LANGUAGE_COOKIE_NAME] = 'en'

        resp = self.client.get(reverse('login'), HTTP_ACCEPT_LANGUAGE='it')

        self.assertEqual(resp.headers['Content-Language'], 'en')


class AdoptionAtFirstSignInTests(TestCase):
    """US2 / FR-015: a device choice is adopted when the account has none."""

    def test_first_login_adopts_the_device_choice(self) -> None:
        user = User.objects.create_user(email='adopt@strophae.test', password='pw')
        self.client.cookies[settings.LANGUAGE_COOKIE_NAME] = 'it'

        self.client.post(reverse('login'),
                         {'email': 'adopt@strophae.test', 'password': 'pw'})

        user.refresh_from_db()
        self.assertEqual(user.language, 'it')

    def test_signup_adopts_the_device_choice(self) -> None:
        self.client.cookies[settings.LANGUAGE_COOKIE_NAME] = 'it'

        self.client.post(reverse('signup'),
                         {'name': 'Nuova Utente', 'email': 'nuova@strophae.test',
                          'password': 'pw-lunga-123'})

        user = User.objects.get(email='nuova@strophae.test')
        self.assertEqual(user.language, 'it')

    def test_invalid_cookie_value_is_not_adopted(self) -> None:
        user = User.objects.create_user(email='badck@strophae.test', password='pw')
        self.client.cookies[settings.LANGUAGE_COOKIE_NAME] = 'xx'

        self.client.post(reverse('login'),
                         {'email': 'badck@strophae.test', 'password': 'pw'})

        user.refresh_from_db()
        self.assertEqual(user.language, '')

    def test_saved_preference_beats_a_conflicting_device_cookie(self) -> None:
        user = User.objects.create_user(email='keep@strophae.test', password='pw',
                                        language='en')
        self.client.cookies[settings.LANGUAGE_COOKIE_NAME] = 'it'

        resp = self.client.post(reverse('login'),
                                {'email': 'keep@strophae.test', 'password': 'pw'})

        user.refresh_from_db()
        self.assertEqual(user.language, 'en')
        self.assertEqual(resp.cookies[settings.LANGUAGE_COOKIE_NAME].value, 'en')
