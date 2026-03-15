# Rakuten Link for Linux

This repository contains only the conversion tooling that wraps the macOS Rakuten Link desktop build and turns it into a Linux startup-verification target.

## What it does

- Extracts `Info.plist`, `app-update.yml`, and `app.asar` from `RakutenLink.dmg`
- Expands the bundled Electron app into a generated worktree
- Applies Linux safety patches for updater, tray/icon handling, permission APIs, and Bluetooth
- Runs the patched app with Electron `13.6.9`
- Builds an AppImage from the patched runtime

## Current scope

- Target platform: Ubuntu/Debian x86_64
- Goal: reach stable startup and primary UI rendering
- Auto-update is disabled by default on Linux
- Bluetooth discovery is disabled by default on Linux
- Safe window mode is enabled by default on Linux to avoid rapid show/hide loops

This repository is intended to publish only the wrapper scripts and patch layer. Do not commit or redistribute the original Rakuten Link application files, extracted vendor assets, or generated AppImages.

## Prerequisites

- Node.js 18+
- `npm`
- `7z`
- `asar` on your `PATH`, or `@electron/asar` installed through `npm install`

## Usage

1. Place the macOS installer at `/home/kei/ドキュメント/RakutenLink4Linux/RakutenLink.dmg`
2. Install the toolchain:

```bash
npm install
```

3. Extract vendor assets:

```bash
npm run extract
```

4. Expand and patch the Linux runtime:

```bash
npm run patch
```

5. Launch the patched app with Electron:

```bash
npm run dev
```

6. Build an AppImage:

```bash
npm run package
```

7. Run the built AppImage without depending on FUSE:

```bash
npm run appimage:run
```

## Before publishing

Check that no extracted or generated Rakuten Link assets are left in the repository:

```bash
npm run public:check
```

If it reports leftovers, remove them with:

```bash
npm run clean
```

## Environment flags

- `RAKUTENLINK_DISABLE_UPDATER=1`
  - Default on Linux. Set to `0` to opt back into the bundled updater behavior.
- `RAKUTENLINK_ENABLE_BLUETOOTH=0`
  - Default on Linux. Set to `1` to attempt the bundled noble-based flow.
- `RAKUTENLINK_LINUX_SAFE_WINDOW_MODE=1`
  - Default on Linux. Keeps the main window from being auto-hidden/minimized and skips the vendor white-screen flash workaround.
- `RAKUTENLINK_SUPPRESS_VENDOR_STDOUT=1`
  - Default on Linux. Hides the vendor's obfuscated base64-like console noise from the terminal.
- `APPIMAGE_EXTRACT_AND_RUN=1`
  - No longer required for the helper script. `npm run appimage:run` extracts the AppImage internally and launches `AppRun` directly.

Example:

```bash
RAKUTENLINK_ENABLE_BLUETOOTH=1 npm run dev
```

Readable Linux bootstrap logs:

```bash
npm run logs:bootstrap
```

## Generated output

- `.generated/source`
  - Extracted macOS metadata and `app.asar`
- `.generated/work/app`
  - Expanded, patched Linux runtime
- `.generated/manifest.json`
  - Source DMG metadata and SHA-256 of the extracted `app.asar`
- `release/`
  - AppImage output

## Logging

- Early Linux bootstrap logs:
  - `~/.local/state/rakuten-link-linux/bootstrap.log`
- The bundled app still writes its normal Electron logs through `electron-log`
- If `xdg-mime` warns about `qtpaths` on launch, it is non-fatal in current tests

## Known limitations

- This project does not provide Linux-native source code for Rakuten Link
- Auto-update is stubbed on Linux by default
- Bluetooth is stubbed on Linux by default
- Native module rebuilds are out of scope for this milestone
