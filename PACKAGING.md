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

`packaging/icon.{icns,ico,png}` — the mark is the app's own screen drawn flat:
a paper sheet inside a black keyline, one ink bar (the prompt) over three
columns in the Bauhaus primaries (the voices answering it), matching the
landing page.

`icon.png` is the 1024×1024 master and is **flush to the canvas**, which is
what Windows and the web want. The `.icns` is *not* generated from it directly:
macOS since Big Sur expects the rounded square to sit on Apple's grid — 824 of
1024, so roughly 10% empty on each side — or the app looks oversized next to
its neighbours in the Dock. Draw the mac variant with that inset, then:

```bash
mkdir icon.iconset   # icon_16x16.png … icon_512x512@2x.png, drawn at each size
iconutil -c icns icon.iconset -o packaging/icon.icns
```

`.ico` is a PNG-compressed multi-size icon (16/24/32/48/64/128/256), flush like
the master; any ICO encoder produces one. Alternatively point electron-builder
at the 1024×1024 PNG and let it derive both formats, accepting the flush
silhouette on macOS.
