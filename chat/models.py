from typing import Any, ClassVar

from django.conf import settings
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models

# Accent hue palette reused across agents, users and personas.
HUE_PALETTE = [255, 150, 310, 60, 200, 30, 340, 100, 285, 20]

PERSONA_TYPES = ['analyst', 'muse', 'critic', 'coder', 'generic']


class UserManager(BaseUserManager['User']):
    """Email-based manager — strophae has no usernames."""

    use_in_migrations = True

    def _create(self, email: str, password: str | None, **extra: Any) -> 'User':
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None,
                    **extra: Any) -> 'User':
        extra.setdefault('is_staff', False)
        extra.setdefault('is_superuser', False)
        return self._create(email, password, **extra)

    def create_superuser(self, email: str, password: str | None = None,
                         **extra: Any) -> 'User':
        extra.setdefault('is_staff', True)
        extra.setdefault('is_superuser', True)
        extra.setdefault('role', User.Role.ADMIN)
        return self._create(email, password, **extra)


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'Admin', 'Admin'
        MEMBER = 'Member', 'Member'

    username = None  # type: ignore[assignment]
    first_name = None  # type: ignore[assignment]
    last_name = None  # type: ignore[assignment]

    email = models.EmailField(unique=True)
    name = models.CharField(max_length=120, blank=True)
    hue = models.IntegerField(default=255)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.MEMBER)
    # UI language code from settings.LANGUAGES; '' = never chosen, which lets
    # the first sign-in adopt a device-level choice (FR-015). Validated at the
    # set_language endpoint, not with DB choices, so adding a language stays a
    # settings-only change.
    language = models.CharField(max_length=10, blank=True, default='')

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    # django-stubs types AbstractUser.objects as UserManager[User]; strophae's
    # email-only manager subclasses BaseUserManager, so the override type differs.
    objects: ClassVar[UserManager] = UserManager()  # type: ignore[assignment]

    def __str__(self) -> str:
        return self.name or self.email

    @property
    def display_name(self) -> str:
        return self.name or self.email.split('@')[0]

    @property
    def initials(self) -> str:
        parts = (self.name or self.email).strip().split()
        first = parts[0][0] if parts and parts[0] else ''
        second = parts[1][0] if len(parts) > 1 and parts[1] else ''
        return (first + second).upper() or '?'


class PersonaBase(models.Model):
    name = models.CharField(max_length=120)
    hue = models.IntegerField(default=255)
    model = models.CharField(max_length=60, default='GPT-4o')
    persona_type = models.CharField(max_length=20, default='generic')
    system_prompt = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True
        ordering = ['-created_at']

    @property
    def preview(self) -> str:
        return self.system_prompt.strip() or 'No system prompt'


class Persona(PersonaBase):
    """A reusable agent definition, private to its owner."""
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name='personas')


class SharedPersona(PersonaBase):
    """A persona shared to the whole workspace."""
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                               null=True, blank=True, related_name='shared_personas')
    author_name = models.CharField(max_length=120, blank=True)


class Conversation(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name='conversations')
    title = models.CharField(max_length=200, default='New session')
    shared_system_prompt = models.TextField(blank=True)
    shared_files = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self) -> str:
        return self.title

    @property
    def has_shared(self) -> bool:
        return bool(self.shared_system_prompt.strip() or self.shared_files)


class Agent(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE,
                                     related_name='agents')
    name = models.CharField(max_length=120, default='Agent')
    hue = models.IntegerField(default=255)
    model = models.CharField(max_length=60, default='GPT-4o')
    persona_type = models.CharField(max_length=20, default='generic')
    system_prompt = models.TextField(blank=True)
    files = models.JSONField(default=list, blank=True)
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self) -> str:
        return self.name

    @property
    def model_slug(self) -> str:
        return settings.OPENROUTER_MODEL_SLUGS.get(self.model, self.model)


class Message(models.Model):
    class Role(models.TextChoices):
        USER = 'user', 'user'
        ASSISTANT = 'assistant', 'assistant'

    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=12, choices=Role.choices)
    text = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
