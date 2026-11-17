# Rakuten Link for Linux

This repository contains only the wrapper scripts and patch layer used to run the macOS Rakuten Link desktop app on Linux for personal verification.

## Overview

- Extracts `Info.plist`, `app-update.yml`, and `app.asar` from `RakutenLink.dmg`
- Applies Linux compatibility patches
- Runs the patched app with Electron
- Builds an AppImage

Verified against Rakuten Link 2.1.0 for macOS, which bundles Electron 15.5.7. The wrapper uses the same Electron version, because 2.1.0 needs at least Node 16 (`require('node:crypto')`) and does not start on Electron 13.

## Prerequisites

- Node.js 18+
- `npm`
- `7z`

## Usage

1. Download the Mac installer from the official page (https://service.link.link/desktop/) and place it in the repository root as `RakutenLink.dmg`
2. Install dependencies:

```bash
npm install
```

3. Extract the app:

```bash
npm run extract
```

4. Patch the Linux runtime:

```bash
npm run patch
```

`npm install` no longer runs the extract and patch steps automatically. Use `npm run prepare:runtime` to run both at once.

5. Run it with Electron:

```bash
npm run dev
```

6. Build an AppImage:

```bash
npm run package
```

7. Run the AppImage:

```bash
npm run appimage:run
```

## Publishing Notes

Do not commit or redistribute:

- `RakutenLink.dmg`
- extracted vendor files
- generated AppImages
- anything under `.generated/`, `release/`, `dist/`, or `squashfs-root/`

Before publishing, check that only the wrapper project is git-visible:

```bash
npm run public:check
```

If needed, remove generated output:

```bash
npm run clean
```

## Environment flags

- `RAKUTENLINK_DISABLE_UPDATER=1`
- `RAKUTENLINK_ENABLE_BLUETOOTH=0`
- `RAKUTENLINK_LINUX_SAFE_WINDOW_MODE=1`
- `RAKUTENLINK_SUPPRESS_VENDOR_STDOUT=1`
- `RAKUTENLINK_SUPPRESS_VENDOR_STDOUT=0` to show the app's original console output again

## Logging

- Human-readable bootstrap log:
  - `~/.local/state/rakuten-link-linux/bootstrap.log`

## Known limitations

- This project does not include Rakuten Link source code
- Some features are still Linux workarounds rather than native implementations
