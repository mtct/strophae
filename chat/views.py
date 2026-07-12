import json
import secrets
from datetime import datetime
from typing import Any

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.db.models import Count
from django.http import (HttpRequest, HttpResponse, HttpResponseForbidden,
                         JsonResponse)
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from django.utils.translation import gettext as _
from django.utils.translation import gettext_lazy
from django.views.decorators.http import require_POST

from . import defaults
from .models import (Agent, Conversation, HUE_PALETTE, Message, Persona,
                     SharedPersona, User)

MODEL_BACKEND = 'django.contrib.auth.backends.ModelBackend'


class AuthedHttpRequest(HttpRequest):
    """An HttpRequest for views behind ``@login_required``: ``user`` is a ``User``.

    Django attaches ``request.user`` at runtime; the stock ``HttpRequest`` types it
    as ``User | AnonymousUser``. Views guarded by ``@login_required`` only ever run
    for an authenticated account, so narrowing it here lets the type checker resolve
    our custom ``User`` fields (``hue``, ``role``, ``personas`` …) without casts.
    """

    user: User


# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #

def _next_hue(used: list[int]) -> int:
    for h in HUE_PALETTE:
        if h not in used:
            return h
    return HUE_PALETTE[len(used) % len(HUE_PALETTE)]


def create_session(user: User) -> Conversation:
    """A fresh conversation seeded with a single neutral agent (Simple Jack).

    Title and starter agent are born in the active interface language and are
    user content from then on — never re-translated (FR-014).
    """
    conv = Conversation.objects.create(owner=user, title=_('New session'))
    Agent.objects.create(conversation=conv, order=0,
                         **defaults.localized_agent(defaults.DEFAULT_AGENT))
    return conv


def get_or_create_draft(user: User) -> Conversation:
    draft = (Conversation.objects.filter(owner=user)
             .annotate(mc=Count('agents__messages')).filter(mc=0)
             .order_by('-updated_at').first())
    return draft or create_session(user)


def _rel_time(ts: datetime) -> str:
    minutes = int((timezone.now() - ts).total_seconds() // 60)
    if minutes < 1:
        return _('just now')
    if minutes < 60:
        return _('%dm ago') % minutes
    hours = minutes // 60
    if hours < 24:
        return _('%dh ago') % hours
    days = hours // 24
    if days == 1:
        return _('yesterday')
    if days < 7:
        return _('%dd ago') % days
    return _('%dw ago') % (days // 7)


# Buckets are keyed by stable ids so grouping never changes with the language;
# only the display label is translated, at render time (FR-008).
GROUP_LABELS = {
    'today': gettext_lazy('Today'),
    'yesterday': gettext_lazy('Yesterday'),
    'week': gettext_lazy('Previous 7 days'),
    'earlier': gettext_lazy('Earlier'),
}


def _group_key(ts: datetime, start_today: float) -> str:
    day = 86400
    epoch = ts.timestamp()
    if epoch >= start_today:
        return 'today'
    if epoch >= start_today - day:
        return 'yesterday'
    if epoch >= start_today - 7 * day:
        return 'week'
    return 'earlier'


def conversation_groups(user: User,
                        current_id: int | None = None) -> list[dict[str, Any]]:
    convs = (Conversation.objects.filter(owner=user)
             .annotate(mc=Count('agents__messages')).filter(mc__gt=0)
             .prefetch_related('agents').order_by('-updated_at'))
    today = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
    start_today = today.timestamp()
    buckets: dict[str, list[dict[str, Any]]] = {
        'today': [], 'yesterday': [], 'week': [], 'earlier': []}
    for c in convs:
        item = {
            'id': c.id,
            'title': c.title,
            'meta': _rel_time(c.updated_at),
            'active': c.id == current_id,
            'dots': [defaults.accent(a.hue) for a in list(c.agents.all())[:5]],
        }
        buckets[_group_key(c.updated_at, start_today)].append(item)
    return [{'label': GROUP_LABELS[k], 'items': v} for k, v in buckets.items() if v]


def agent_view(agent: Agent) -> dict[str, Any]:
    """A dict of an agent's render data for templates / JSON."""
    return {
        'id': agent.id,
        'name': agent.name,
        'hue': agent.hue,
        'model': agent.model,
        'persona_type': agent.persona_type,
        'system_prompt': agent.system_prompt,
        'model_slug': agent.model_slug,
        'accent': defaults.accent(agent.hue),
        'soft': defaults.soft(agent.hue),
        'header_bg': defaults.header_bg(agent.hue),
        'files': agent.files or [],
    }


def _persona_dict(p: Persona, conv_id: int) -> dict[str, Any]:
    """A personal persona as a plain dict for the reactive library store."""
    return {
        'id': p.id, 'name': p.name, 'model': p.model,
        'accent': defaults.accent(p.hue), 'preview': p.preview,
        'add_url': reverse('add_from_persona', args=[p.id, conv_id]),
        'share_url': reverse('share_persona', args=[p.id]),
        'delete_url': reverse('delete_persona', args=[p.id]),
    }


def _shared_dict(p: SharedPersona, request: HttpRequest,
                 conv_id: int | str | None) -> dict[str, Any]:
    """A shared persona as a plain dict for the reactive library store."""
    return {
        'id': p.id, 'name': p.name, 'model': p.model,
        'accent': defaults.accent(p.hue), 'preview': p.preview,
        'author_name': p.author_name,
        'mine': p.author_id == request.user.id,
        'add_url': reverse('add_from_shared', args=[p.id, conv_id]),
        'unshare_url': reverse('unshare_persona', args=[p.id]),
    }


def library_data(request: AuthedHttpRequest, conv: Conversation) -> dict[str, Any]:
    """JSON seed for the Alpine `$store.library` (personal + shared personas)."""
    return {'library_json': {
        'personas': [_persona_dict(p, conv.id) for p in request.user.personas.all()],
        'shared': [_shared_dict(p, request, conv.id)
                   for p in SharedPersona.objects.select_related('author').all()],
    }}


def shell_context(request: AuthedHttpRequest,
                  conv: Conversation | None = None) -> dict[str, Any]:
    """Sidebar + identity data shared by every authed screen."""
    user = request.user
    groups = conversation_groups(user, conv.id if conv else None)
    others = list(User.objects.exclude(id=user.id).order_by('name'))
    return {
        'conv_groups': groups,
        'history_empty': not groups,
        'me': user,
        'is_admin': _is_admin(user),
        'debug': settings.DEBUG,
        'me_accent': defaults.accent(user.hue),
        'other_users': [{'id': u.id, 'name': u.display_name,
                         'initials': u.initials, 'accent': defaults.accent(u.hue)}
                        for u in others],
        'has_others': bool(others),
        'current_conv': conv,
    }


def _owned_conv(request: HttpRequest, conv_id: int) -> Conversation:
    return get_object_or_404(Conversation, id=conv_id, owner=request.user)


def _owned_agent(request: HttpRequest, agent_id: int) -> Agent:
    return get_object_or_404(Agent, id=agent_id, conversation__owner=request.user)


def _toast(message: str) -> dict[str, str]:
    """An HX-Trigger header that fires a client-side toast."""
    return {'HX-Trigger': json.dumps({'toast': message})}


def _is_admin(user: User) -> bool:
    return user.role == User.Role.ADMIN


# --------------------------------------------------------------------------- #
#  Auth
# --------------------------------------------------------------------------- #

def home(request: HttpRequest) -> HttpResponse:
    user = request.user
    if not isinstance(user, User):
        return redirect('login')
    draft = get_or_create_draft(user)
    return redirect('compose', conv_id=draft.id)


def _demo_users() -> list[dict[str, Any]]:
    return [{'name': u.display_name, 'email': u.email, 'initials': u.initials,
             'accent': defaults.accent(u.hue)}
            for u in User.objects.order_by('id')[:3]]


def _sync_language_at_login(request: HttpRequest, user: User,
                            resp: HttpResponse) -> HttpResponse:
    """Reconcile account preference and device choice at sign-in (FR-004/FR-015).

    The account preference always wins after sign-in and is written to this
    device's cookie. An account that never chose a language adopts the device
    choice at this first sign-in (signup counts as a first sign-in).
    """
    if user.language:
        return _set_language_cookie(resp, user.language)
    cookie = request.COOKIES.get(settings.LANGUAGE_COOKIE_NAME, '')
    if cookie in dict(settings.LANGUAGES):
        user.language = cookie
        user.save(update_fields=['language'])
    return resp


def login_view(request: HttpRequest) -> HttpResponse:
    if request.user.is_authenticated:
        return redirect('home')
    error = ''
    if request.method == 'POST':
        email = (request.POST.get('email') or '').strip().lower()
        password = request.POST.get('password') or ''
        user = authenticate(request, username=email, password=password)
        if isinstance(user, User):
            login(request, user)
            return _sync_language_at_login(request, user, redirect('home'))
        error = _('Invalid email or password.')
    mode = 'signup' if request.GET.get('mode') == 'signup' else 'signin'
    return render(request, 'chat/login.html',
                  {'mode': mode, 'error': error, 'demo_users': _demo_users(),
                   'email': request.POST.get('email', '')})


def signup_view(request: HttpRequest) -> HttpResponse:
    if request.method != 'POST':
        return redirect('login')
    name = (request.POST.get('name') or '').strip()
    email = (request.POST.get('email') or '').strip().lower()
    password = request.POST.get('password') or ''
    error = ''
    if not (name and email and password):
        error = _('Fill in name, email and password.')
    elif User.objects.filter(email=email).exists():
        error = _('An account with that email already exists.')
    if error:
        return render(request, 'chat/login.html',
                      {'mode': 'signup', 'error': error, 'demo_users': _demo_users(),
                       'name': name, 'email': email})
    hue = _next_hue([u.hue for u in User.objects.all()])
    user = User.objects.create_user(email=email, password=password, name=name, hue=hue)
    login(request, user, backend=MODEL_BACKEND)
    return _sync_language_at_login(request, user, redirect('home'))


@require_POST
def logout_view(request: HttpRequest) -> HttpResponse:
    logout(request)
    return redirect('login')


def _set_language_cookie(resp: HttpResponse, code: str) -> HttpResponse:
    """Write the device-level language choice with Django's standard cookie."""
    resp.set_cookie(
        settings.LANGUAGE_COOKIE_NAME, code,
        max_age=settings.LANGUAGE_COOKIE_AGE,
        path=settings.LANGUAGE_COOKIE_PATH,
        domain=settings.LANGUAGE_COOKIE_DOMAIN,
        secure=settings.LANGUAGE_COOKIE_SECURE,
        httponly=settings.LANGUAGE_COOKIE_HTTPONLY,
        samesite=settings.LANGUAGE_COOKIE_SAMESITE,
    )
    return resp


@require_POST
def set_language(request: HttpRequest) -> HttpResponse:
    """Change the UI language: cookie for this device, account field if signed in."""
    nxt = request.POST.get('next') or ''
    if not url_has_allowed_host_and_scheme(nxt, allowed_hosts={request.get_host()},
                                           require_https=request.is_secure()):
        nxt = reverse('home')
    resp = redirect(nxt)
    code = request.POST.get('language') or ''
    if code not in dict(settings.LANGUAGES):
        return resp  # unknown code: leave language untouched, just go back
    _set_language_cookie(resp, code)
    user = request.user
    if isinstance(user, User):
        user.language = code
        user.save(update_fields=['language'])
    return resp


@login_required
@require_POST
def switch_user(request: HttpRequest, user_id: int) -> HttpResponse:
    """Demo-only affordance: hop into another workspace account.

    This is account impersonation and is intentionally restricted to local demo
    builds (DEBUG=True). It must never be reachable in a real deployment.
    """
    if not settings.DEBUG:
        return HttpResponseForbidden(_('Account switching is disabled.'))
    target = get_object_or_404(User, id=user_id)
    login(request, target, backend=MODEL_BACKEND)
    # Apply the target account's language (account wins), but never adopt this
    # device's cookie into the impersonated account — it isn't their choice.
    resp: HttpResponse = redirect('home')
    if target.language:
        _set_language_cookie(resp, target.language)
    return resp


# --------------------------------------------------------------------------- #
#  Sessions & screens
# --------------------------------------------------------------------------- #

@login_required
@require_POST
def new_session(request: AuthedHttpRequest) -> HttpResponse:
    conv = create_session(request.user)
    return redirect('compose', conv_id=conv.id)


@login_required
def compose(request: AuthedHttpRequest, conv_id: int) -> HttpResponse:
    conv = _owned_conv(request, conv_id)
    agents = [agent_view(a) for a in conv.agents.all()]
    ctx = shell_context(request, conv)
    ctx.update({
        'screen': 'compose',
        'conv': conv,
        'agents': agents,
        'models': settings.OPENROUTER_MODELS,
        'agent_count': len(agents),
        'persona_count': request.user.personas.count(),
    })
    ctx.update(library_data(request, conv))
    return render(request, 'chat/compose.html', ctx)


@login_required
def chat(request: AuthedHttpRequest, conv_id: int) -> HttpResponse:
    conv = _owned_conv(request, conv_id)
    agents = []
    for a in conv.agents.all():
        data = agent_view(a)
        data['messages'] = [{'role': m.role, 'text': m.text}
                            for m in a.messages.all()]
        agents.append(data)
    ctx = shell_context(request, conv)
    ctx.update({
        'screen': 'chat',
        'conv': conv,
        'agents': agents,
        'shared_prompt': conv.shared_system_prompt,
        'has_shared': conv.has_shared,
        'models': settings.OPENROUTER_MODELS,
        'model_slugs': settings.OPENROUTER_MODEL_SLUGS,
        'agent_count': len(agents),
    })
    ctx.update(library_data(request, conv))
    return render(request, 'chat/chat.html', ctx)


@login_required
@require_POST
def delete_conversation(request: HttpRequest, conv_id: int) -> HttpResponse:
    conv = _owned_conv(request, conv_id)
    conv.delete()
    if request.headers.get('HX-Request'):
        return HttpResponse(status=204, headers={'HX-Redirect': '/'})
    return redirect('home')


@login_required
@require_POST
def update_shared(request: HttpRequest, conv_id: int) -> HttpResponse:
    conv = _owned_conv(request, conv_id)
    conv.shared_system_prompt = request.POST.get('shared_system_prompt', '')
    conv.save(update_fields=['shared_system_prompt', 'updated_at'])
    return HttpResponse(status=204)


# --------------------------------------------------------------------------- #
#  Agents
# --------------------------------------------------------------------------- #

def _added_agent_response(request: HttpRequest, conv: Conversation, agent: Agent,
                          toast: str | None = None) -> HttpResponse:
    """Render a freshly added agent for whichever screen asked for it.

    Compose (htmx) gets the ``agent_card`` partial to append to the grid; the
    chat screen (``?for=chat``) gets JSON the Alpine app pushes onto its columns.
    An optional toast rides along — as an ``HX-Trigger`` header or a JSON field.
    """
    data = agent_view(agent)
    if request.GET.get('for') == 'chat':
        data['messages'] = []
        return JsonResponse({'agent': data, 'toast': toast})
    resp = render(request, 'chat/partials/agent_card.html',
                  {'agent': data, 'models': settings.OPENROUTER_MODELS, 'conv': conv})
    if toast:
        resp['HX-Trigger'] = json.dumps({'toast': toast})
    return resp


@login_required
@require_POST
def add_agent(request: HttpRequest, conv_id: int) -> HttpResponse:
    conv = _owned_conv(request, conv_id)
    used = [a.hue for a in conv.agents.all()]
    count = conv.agents.count()
    agent = Agent.objects.create(
        conversation=conv, name=_('Agent %(n)s') % {'n': count + 1},
        hue=_next_hue(used),
        model='DeepSeek 4 Flash', persona_type='generic', order=count)
    return _added_agent_response(request, conv, agent)


@login_required
@require_POST
def update_agent(request: HttpRequest, agent_id: int) -> HttpResponse:
    agent = _owned_agent(request, agent_id)
    fields = []
    for field in ('name', 'model', 'system_prompt'):
        if field in request.POST:
            setattr(agent, field, request.POST[field])
            fields.append(field)
    if fields:
        agent.save(update_fields=fields)
    return HttpResponse(status=204)


@login_required
@require_POST
def cycle_color(request: HttpRequest, agent_id: int) -> HttpResponse:
    agent = _owned_agent(request, agent_id)
    agent.hue = (agent.hue + 40) % 360
    agent.save(update_fields=['hue'])
    return render(request, 'chat/partials/agent_card.html',
                  {'agent': agent_view(agent), 'models': settings.OPENROUTER_MODELS,
                   'conv': agent.conversation})


@login_required
@require_POST
def remove_agent(request: HttpRequest, agent_id: int) -> HttpResponse:
    agent = _owned_agent(request, agent_id)
    agent.delete()  # the last agent may be removed too — a session can be empty
    return HttpResponse(status=200)  # empty 200 so htmx runs hx-swap="delete"


@login_required
@require_POST
def clear_thread(request: HttpRequest, agent_id: int) -> HttpResponse:
    agent = _owned_agent(request, agent_id)
    agent.messages.all().delete()
    return HttpResponse(status=204)


@login_required
@require_POST
def save_persona(request: AuthedHttpRequest, agent_id: int) -> HttpResponse:
    agent = _owned_agent(request, agent_id)
    p = Persona.objects.create(
        owner=request.user, name=agent.name, hue=agent.hue, model=agent.model,
        persona_type=agent.persona_type, system_prompt=agent.system_prompt)
    # htmx dispatches `persona-saved` (with the new row) so the library store
    # updates live, alongside the usual toast.
    return HttpResponse(status=204, headers={'HX-Trigger': json.dumps({
        'toast': _('Saved “%(name)s” to library') % {'name': agent.name},
        'persona-saved': _persona_dict(p, agent.conversation_id),
    })})


# --------------------------------------------------------------------------- #
#  Sending & streaming persistence
# --------------------------------------------------------------------------- #

@login_required
@require_POST
def send_message(request: HttpRequest, conv_id: int) -> HttpResponse:
    """Persist the user prompt + an empty assistant slot per agent.

    The browser streams real tokens from OpenRouter into the assistant slots
    and calls finalize_message when each agent completes.
    """
    conv = _owned_conv(request, conv_id)
    text = (json.loads(request.body or '{}').get('text') or '').strip()
    if not text:
        return JsonResponse({'error': 'empty'}, status=400)

    first = not Message.objects.filter(agent__conversation=conv).exists()
    if first:
        conv.title = (text[:46].strip() + '…') if len(text) > 46 else text
    conv.save()  # bumps updated_at, persists title

    result = {}
    for agent in conv.agents.all():
        Message.objects.create(agent=agent, role='user', text=text)
        assistant = Message.objects.create(agent=agent, role='assistant', text='')
        result[str(agent.id)] = assistant.id
    return JsonResponse({'messages': result, 'title': conv.title, 'first': first})


@login_required
@require_POST
def finalize_message(request: HttpRequest, msg_id: int) -> HttpResponse:
    msg = get_object_or_404(Message, id=msg_id,
                            agent__conversation__owner=request.user)
    msg.text = json.loads(request.body or '{}').get('text', '')
    msg.save(update_fields=['text'])
    Conversation.objects.filter(pk=msg.agent.conversation_id).update(
        updated_at=timezone.now())
    return HttpResponse(status=204)


# --------------------------------------------------------------------------- #
#  Personas library
# --------------------------------------------------------------------------- #

def _spawn_agent_from(conv: Conversation, src: Persona | SharedPersona) -> Agent:
    count = conv.agents.count()
    return Agent.objects.create(
        conversation=conv, name=src.name, hue=src.hue, model=src.model,
        persona_type=src.persona_type, system_prompt=src.system_prompt, order=count)


@login_required
@require_POST
def add_from_persona(request: HttpRequest, persona_id: int,
                     conv_id: int) -> HttpResponse:
    conv = _owned_conv(request, conv_id)
    p = get_object_or_404(Persona, id=persona_id, owner=request.user)
    agent = _spawn_agent_from(conv, p)
    return _added_agent_response(
        request, conv, agent, _('Added “%(name)s” to the session') % {'name': p.name})


@login_required
@require_POST
def add_from_shared(request: HttpRequest, persona_id: int,
                    conv_id: int) -> HttpResponse:
    conv = _owned_conv(request, conv_id)
    p = get_object_or_404(SharedPersona, id=persona_id)
    agent = _spawn_agent_from(conv, p)
    return _added_agent_response(
        request, conv, agent, _('Added “%(name)s” to the session') % {'name': p.name})


@login_required
@require_POST
def share_persona(request: AuthedHttpRequest, persona_id: int) -> HttpResponse:
    p = get_object_or_404(Persona, id=persona_id, owner=request.user)
    conv_id = request.GET.get('conv')
    if SharedPersona.objects.filter(
            name=p.name, author_name=request.user.display_name).exists():
        return JsonResponse({'shared': None, 'toast': _('Already shared')})
    sp = SharedPersona.objects.create(
        name=p.name, hue=p.hue, model=p.model, persona_type=p.persona_type,
        system_prompt=p.system_prompt, author=request.user,
        author_name=request.user.display_name)
    return JsonResponse({'shared': _shared_dict(sp, request, conv_id),
                         'toast': _('Shared “%(name)s” with the team') % {'name': p.name}})


@login_required
@require_POST
def delete_persona(request: HttpRequest, persona_id: int) -> HttpResponse:
    get_object_or_404(Persona, id=persona_id, owner=request.user).delete()
    return HttpResponse(status=200)  # empty 200 so htmx runs hx-swap="delete"


@login_required
@require_POST
def unshare_persona(request: AuthedHttpRequest, persona_id: int) -> HttpResponse:
    # Only the author (or an admin) may pull a persona from the team library.
    qs = SharedPersona.objects.all() if _is_admin(request.user) \
        else SharedPersona.objects.filter(author=request.user)
    get_object_or_404(qs, id=persona_id).delete()
    return HttpResponse(status=200)  # empty 200 so htmx runs hx-swap="delete"


# --------------------------------------------------------------------------- #
#  Settings & members
# --------------------------------------------------------------------------- #

@login_required
def settings_view(request: AuthedHttpRequest) -> HttpResponse:
    ctx = shell_context(request)
    ctx['screen'] = 'settings'
    return render(request, 'chat/settings.html', ctx)


def _members_payload(request: HttpRequest) -> list[dict[str, Any]]:
    return [{'obj': u, 'initials': u.initials, 'accent': defaults.accent(u.hue),
             'is_you': u.id == request.user.id} for u in User.objects.order_by('id')]


@login_required
def members_view(request: AuthedHttpRequest) -> HttpResponse:
    ctx = shell_context(request)
    ctx.update({'screen': 'members', 'members': _members_payload(request),
                'member_count': User.objects.count()})
    return render(request, 'chat/members.html', ctx)


@login_required
@require_POST
def invite_member(request: AuthedHttpRequest) -> HttpResponse:
    if not _is_admin(request.user):
        return HttpResponseForbidden(_('Only admins can invite members.'))
    name = (request.POST.get('name') or '').strip()
    email = (request.POST.get('email') or '').strip().lower()
    if not (name and email):
        return HttpResponse(status=204, headers=_toast(_('Enter a name and email')))
    if User.objects.filter(email=email).exists():
        return HttpResponse(status=204,
                            headers=_toast(_('That email is already a member')))
    hue = _next_hue([u.hue for u in User.objects.all()])
    # No usable password is set here — a real invite would email a set-password
    # token. An unguessable random secret avoids a known/shared credential.
    User.objects.create_user(email=email, password=secrets.token_urlsafe(24),
                             name=name, hue=hue)
    resp = render(request, 'chat/partials/members_list.html',
                  {'members': _members_payload(request), 'is_admin': True})
    resp['HX-Trigger'] = json.dumps({'toast': _('Invited %(name)s') % {'name': name}})
    return resp


@login_required
@require_POST
def set_role(request: AuthedHttpRequest, user_id: int) -> HttpResponse:
    if not _is_admin(request.user):
        return HttpResponseForbidden(_('Only admins can change roles.'))
    if user_id == request.user.id:
        return HttpResponse(status=409)  # don't let an admin change their own role
    user = get_object_or_404(User, id=user_id)
    role = request.POST.get('role')
    if role in dict(User.Role.choices):
        user.role = role
        user.save(update_fields=['role'])
    return HttpResponse(status=204)


@login_required
@require_POST
def remove_member(request: AuthedHttpRequest, user_id: int) -> HttpResponse:
    if not _is_admin(request.user):
        return HttpResponseForbidden(_('Only admins can remove members.'))
    if user_id == request.user.id:
        return HttpResponse(status=409)
    get_object_or_404(User, id=user_id).delete()
    if request.headers.get('HX-Request'):
        return render(request, 'chat/partials/members_list.html',
                      {'members': _members_payload(request), 'is_admin': True})
    return HttpResponse(status=204)
