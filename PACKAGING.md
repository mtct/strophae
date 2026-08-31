# Packaging & store distribution

Local artifacts (unsigned, for testing):

```bash
bun run dist        # or: bunx electron-builder --dir  for a quick unpacked build
```

CI (`.github/workflows/desktop.yml`) builds **macOS arm64** (dmg+zip) and
**Windows x64** (NSIS setup.exe + zip) on every manual run or `v*` tag — one
architecture per platform, pinned in `electron-builder.yml` rather than on the
command line, so a local build produces exactly what CI does. A `v*` tag also
publishes the binaries as the GitHub release the landing page links to.

The names carry no version, so a link keeps working release after release —
which is what `docs/index.html` points at:

| file | platform |
| --- | --- |
| `Strophae-macos-arm64.dmg` (and `.zip`) | macOS 11+, Apple Silicon |
| `Strophae-windows-x64-setup.exe` | Windows 10/11 x64, per-user installer |
| `Strophae-windows-x64.zip` | Windows 10/11 x64, portable |

```text
https://github.com/mtct/strophae/releases/latest/download/Strophae-macos-arm64.dmg
```

Cutting a release is a tag away — bump `version` in `package.json` first, since
it names the app, not the files:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

Both platforms cross-build from macOS — electron-builder 26 patches the
Windows executable with a native rcedit, so **no wine is needed**:

```bash
bunx electron-builder --win                    # setup.exe + zip, x64
bunx electron-builder --mac -c.mac.identity=-  # dmg + zip, arm64
```

`-c.mac.identity=-` **ad-hoc signs** the app, exactly as CI does: arm64 macOS
refuses to launch a binary that carries no signature at all, and there is no
Developer ID here. It is a flag rather than a config key so the `mas` build,
which inherits `mac`, still demands a real certificate. Users clear quarantine
once (right-click → **Open**, or `xattr -dr com.apple.quarantine`); the
unsigned Windows build costs one SmartScreen *More info → Run anyway*.

The Windows installer is per-user (`%LOCALAPPDATA%\Programs`, no UAC), lets
the user pick the directory, and leaves user data in place on uninstall.

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
