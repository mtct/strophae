#!/bin/zsh
# Remove the retired Python implementation (Django data layer + Qt native
# app) now that strophae is Electron + Bun + React.
#
# Tracked files go through `git rm` (recoverable from git history with
# `git checkout <commit> -- <path>`); the Qt app under desktop/ and the
# session-created helpers were never committed, so they are plain-removed.
# Run from the repo root:  zsh scripts/remove-python-layer.sh

set -euo pipefail

# Tracked sources of the Python era. Brand icons were copied to packaging/
# first; locale/ is superseded by src/shared/i18n.ts.
# -f: some of these carry uncommitted session edits; the pristine versions
# are in HEAD, which is what matters for recoverability.
git rm -r -f -q chat config locale
git rm -f -q manage.py pyproject.toml uv.lock

# Never-committed Python-era files and tooling leftovers.
rm -rf desktop chat config
rm -f scripts/remove-web-layer.sh
rm -rf .venv .mypy_cache .pytest_cache .ruff_cache
rm -f strophae.sqlite3

echo "Python layer removed (staged deletions + untracked cleanup)."
