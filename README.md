# strophae

Multi-persona chat. One prompt, many minds — broadcast a message to several agents at
once, each with its own model, system prompt and colour, and watch them answer in
parallel, streaming live in their own columns.

Built with Django + htmx + Alpine.js + Tailwind/DaisyUI. Real model responses are
streamed through [OpenRouter](https://openrouter.ai); your API key is stored only in
your browser and sent directly to OpenRouter.

## Quick start

```bash
uv sync
uv run python manage.py migrate
uv run python manage.py seed        # demo data
uv run python manage.py runserver
```

Open http://127.0.0.1:8000 and sign in with a demo account:

| Email | Password |
| --- | --- |
| `alex@strophae.app` | `demo` |
| `sam@strophae.app` | `demo` |
| `mei@strophae.app` | `demo` |

To run real models, open **Settings** and paste an OpenRouter API key
(`sk-or-…`, from <https://openrouter.ai/keys>).

## How it works

- **Compose** a "council" of agents (name, colour, model, system prompt) plus an optional
  shared context applied to every agent. Save agents as reusable **personas**, privately
  or shared with the workspace.
- **Chat** broadcasts each prompt to every agent in parallel; responses stream
  independently per column.
- **Export** a session as Markdown or JSON, or copy a share link.

See [CLAUDE.md](CLAUDE.md) for architecture and developer notes.

> Note: the bundled CDN assets and `DEBUG=True` settings are for local development only.
