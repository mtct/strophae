from datetime import timedelta
from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone, translation

from chat import defaults
from chat.models import (Agent, Conversation, Message, Persona, SharedPersona,
                         User)


class Command(BaseCommand):
    help = 'Seed demo users, shared personas and the demo account history.'

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:
        # Demo content is deliberately English whatever the operator's active
        # language: seeded rows are user content (spec 002 assumption), and a
        # deterministic seed keeps the demo walkthrough reproducible.
        with translation.override('en'):
            self._seed()
        self.stdout.write(self.style.SUCCESS(
            'Seeded demo data. Sign in with alex@strophae.app / demo'))

    def _seed(self) -> None:
        # Demo users (password "demo").
        users = {}
        for u in defaults.DEMO_USERS:
            user, created = User.objects.get_or_create(
                email=u['email'],
                defaults={'name': u['name'], 'hue': u['hue'], 'role': u['role']},
            )
            if created:
                user.set_password('demo')
                user.save()
            users[u['id_hint']] = user

        # Shared (team) personas.
        if not SharedPersona.objects.exists():
            for p in defaults.SHARED_PERSONAS:
                author = next((users[k] for k in users
                              if users[k].name == p['author_name']), None)
                SharedPersona.objects.create(author=author, **p)

        alex = users['alex']

        # Alex's personal persona library.
        if not alex.personas.exists():
            for p in defaults.SEED_PERSONAS:
                Persona.objects.create(owner=alex, **p)

        # Alex's seeded conversation history.
        if not alex.conversations.exists():
            now = timezone.now()
            for title, hours_ago, keys, prompt in defaults.SEED_CONVERSATIONS:
                conv = Conversation.objects.create(owner=alex, title=title)
                Conversation.objects.filter(pk=conv.pk).update(
                    created_at=now - timedelta(hours=hours_ago),
                    updated_at=now - timedelta(hours=hours_ago),
                )
                for i, key in enumerate(keys):
                    cfg = defaults.AGENT_BY_PERSONA[key]
                    agent = Agent.objects.create(conversation=conv, order=i, **cfg)
                    Message.objects.create(agent=agent, role='user', text=prompt)
                    Message.objects.create(
                        agent=agent, role='assistant',
                        text=defaults.SEED_REPLIES.get(key, defaults.SEED_REPLIES['generic']),
                    )
