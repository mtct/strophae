from django.urls import path

from . import views

urlpatterns = [
    path('', views.home, name='home'),

    # Auth
    path('login/', views.login_view, name='login'),
    path('signup/', views.signup_view, name='signup'),
    path('logout/', views.logout_view, name='logout'),
    path('switch/<int:user_id>/', views.switch_user, name='switch_user'),
    path('i18n/set-language/', views.set_language, name='set_language'),

    # Sessions / screens
    path('session/new/', views.new_session, name='new_session'),
    path('c/<int:conv_id>/compose/', views.compose, name='compose'),
    path('c/<int:conv_id>/', views.chat, name='chat'),
    path('c/<int:conv_id>/delete/', views.delete_conversation, name='delete_conversation'),
    path('c/<int:conv_id>/shared/', views.update_shared, name='update_shared'),
    path('c/<int:conv_id>/agent/add/', views.add_agent, name='add_agent'),
    path('c/<int:conv_id>/send/', views.send_message, name='send_message'),

    # Agents
    path('agent/<int:agent_id>/update/', views.update_agent, name='update_agent'),
    path('agent/<int:agent_id>/cycle-color/', views.cycle_color, name='cycle_color'),
    path('agent/<int:agent_id>/remove/', views.remove_agent, name='remove_agent'),
    path('agent/<int:agent_id>/clear/', views.clear_thread, name='clear_thread'),
    path('agent/<int:agent_id>/save-persona/', views.save_persona, name='save_persona'),

    # Messages
    path('message/<int:msg_id>/finalize/', views.finalize_message, name='finalize_message'),

    # Personas library
    path('persona/<int:persona_id>/add/<int:conv_id>/', views.add_from_persona, name='add_from_persona'),
    path('persona/<int:persona_id>/share/', views.share_persona, name='share_persona'),
    path('persona/<int:persona_id>/delete/', views.delete_persona, name='delete_persona'),
    path('shared/<int:persona_id>/add/<int:conv_id>/', views.add_from_shared, name='add_from_shared'),
    path('shared/<int:persona_id>/unshare/', views.unshare_persona, name='unshare_persona'),

    # Settings / members
    path('settings/', views.settings_view, name='settings'),
    path('members/', views.members_view, name='members'),
    path('members/invite/', views.invite_member, name='invite_member'),
    path('members/<int:user_id>/role/', views.set_role, name='set_role'),
    path('members/<int:user_id>/remove/', views.remove_member, name='remove_member'),
]
