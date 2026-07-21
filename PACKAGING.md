# Packaging & store distribution

Local artifacts (unsigned, for testing):

```bash
bun run dist        # or: bunx electron-builder --dir  for a quick unpacked build
```

CI (`.github/workflows/desktop.yml`) builds macOS (dmg+zip) and Windows
(zip) on every manual run or `v*` tag.

## Mac App Store

Prereqs: Apple Developer Program; an app record in App Store Connect with
bundle id `app.strophae.desktop`; the *3rd Party Mac Developer Application /
Installer* certificates and a Mac App Store provisioning profile.

```bash
bunx electron-builder --mac mas
```

electron-builder signs with the entitlements in `packaging/`
(`entitlements.mas.plist` — App Sandbox + JIT + network client) and produces
`release/Strophae-*.pkg`; upload it with Transporter. Configure the signing
identity via the standard electron-builder env vars (`CSC_LINK` /
`CSC_KEY_PASSWORD`) or your keychain, and set `provisioningProfile` under
the `mas` key in `electron-builder.yml` when you have the profile.

## Microsoft Store

Prereqs: a Partner Center account and a reserved app name. Partner Center
shows the **Product identity** values; put them into the `appx` section of
`electron-builder.yml` (the three `REPLACE…` placeholders).

```powershell
bunx electron-builder --win appx
```

Upload `release/Strophae-*.appx` in Partner Center — Microsoft signs store
submissions, no local certificate needed.

## Icons

`packaging/icon.{icns,ico,png}` are generated from code — the mark is the
ink tile + three agent dots + the wordmark's "s". They were produced by the
retired Qt icon generator; regenerate by editing the PNG master or
resurrecting `desktop/packaging/make_icons.py` from git history.
