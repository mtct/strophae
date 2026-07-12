"""002-i18n US3: sidebar group labels and relative times follow the language."""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone, translation

from chat.models import Conversation, Message, User
from chat.views import _rel_time, conversation_groups, create_session


class SidebarLocalizationTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            email='sidebar@strophae.test', password='x', name='Sidebar Tester')

    def _conversation_updated(self, hours_ago: int) -> Conversation:
        conv = create_session(self.user)
        Message.objects.create(agent=conv.agents.get(), role='user', text='hi')
        Conversation.objects.filter(pk=conv.pk).update(
            updated_at=timezone.now() - timedelta(hours=hours_ago))
        return conv

    def test_group_labels_render_in_italian(self) -> None:
        self._conversation_updated(hours_ago=1)

        with translation.override('it'):
            labels = [str(g['label']) for g in conversation_groups(self.user)]

        self.assertEqual(labels, ['Oggi'])

    def test_group_labels_render_in_english_by_default(self) -> None:
        self._conversation_updated(hours_ago=1)

        with translation.override('en'):
            labels = [str(g['label']) for g in conversation_groups(self.user)]

        self.assertEqual(labels, ['Today'])

    def test_grouping_is_unchanged_by_the_language(self) -> None:
        self._conversation_updated(hours_ago=1)
        self._conversation_updated(hours_ago=30)
        self._conversation_updated(hours_ago=24 * 20)

        # Labels are lazy: they resolve in whatever language is active when
        # rendered, so they must be stringified inside the override blocks.
        with translation.override('en'):
            english = conversation_groups(self.user)
            english_sizes = [len(g['items']) for g in english]
        with translation.override('it'):
            italian = conversation_groups(self.user)
            italian_sizes = [len(g['items']) for g in italian]
            italian_labels = [str(g['label']) for g in italian]

        self.assertEqual(english_sizes, italian_sizes)
        self.assertEqual(italian_labels, ['Oggi', 'Ieri', 'Prima'])

    def test_relative_times_are_localized(self) -> None:
        now = timezone.now()

        with translation.override('it'):
            self.assertEqual(_rel_time(now), 'adesso')
            self.assertEqual(_rel_time(now - timedelta(minutes=5)), '5m fa')
            self.assertEqual(_rel_time(now - timedelta(hours=3)), '3h fa')
            self.assertEqual(
                _rel_time(now - timedelta(days=1, minutes=5)), 'ieri')
            self.assertEqual(_rel_time(now - timedelta(days=3)), '3g fa')
            self.assertEqual(_rel_time(now - timedelta(days=15)), '2sett fa')

    def test_relative_times_stay_english_without_override(self) -> None:
        now = timezone.now()

        with translation.override('en'):
            self.assertEqual(_rel_time(now - timedelta(minutes=5)), '5m ago')
            self.assertEqual(_rel_time(now - timedelta(days=3)), '3d ago')
