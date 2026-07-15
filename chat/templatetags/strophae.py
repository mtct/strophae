from django import template

from chat import defaults

register = template.Library()


@register.filter
def accent(hue: int) -> str:
    return defaults.accent(hue)


@register.filter
def soft(hue: int) -> str:
    return defaults.soft(hue)


@register.filter
def header_bg(hue: int) -> str:
    return defaults.header_bg(hue)
