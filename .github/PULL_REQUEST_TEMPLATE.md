<!-- Thanks for the contribution. Keep this short — a few lines is fine. -->

## What this changes

<!-- And why. Link the issue it closes, if there is one. -->

## Checks

- [ ] `bun run typecheck`
- [ ] `bun test`
- [ ] `bun run check` (headless smoke test)

## Notes

- [ ] Adds a new runtime dependency (explain why below — the shipped app
      currently bundles none)
- [ ] Touches user-facing strings (added to **both** the `en` and `it`
      catalogs in `src/shared/i18n.ts`)
- [ ] Touches the security posture (preload bridge, CSP, sandbox flags,
      markdown/mermaid rendering, API key handling)
