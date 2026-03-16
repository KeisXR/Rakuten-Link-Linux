# Rakuten Link for Linux

This repository contains only the wrapper scripts and patch layer used to run the macOS Rakuten Link desktop app on Linux for personal verification.

## Overview

- Extracts `Info.plist`, `app-update.yml`, and `app.asar` from `RakutenLink.dmg`
- Applies Linux compatibility patches
- Runs the patched app with Electron
- Builds an AppImage

## Prerequisites

- Node.js 18+
- `npm`
- `7z`

## Usage

1. Place the macOS installer at `/home/kei/ドキュメント/RakutenLink4Linux/RakutenLink.dmg`
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
