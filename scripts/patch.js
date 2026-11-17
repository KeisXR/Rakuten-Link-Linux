'use strict';

const fs = require('fs');
const path = require('path');
const {
  APP_DIR,
  MANIFEST_PATH,
  PATCHES_DIR,
  ROOT_DIR,
  emptyDir,
  log,
  readJson,
  readText,
  requireFile,
  runCommand,
  writeJson,
  writeText,
} = require('./common');
const { extractVendor } = require('./extract');

function replaceOrThrow(source, searchValue, replacement, label) {
  if (!source.includes(searchValue)) {
    throw new Error(`Could not find ${label}`);
  }

  return source.replace(searchValue, replacement);
}

function insertAfterOrThrow(source, anchor, insertion, label) {
  if (!source.includes(anchor)) {
    throw new Error(`Could not find ${label}`);
  }

  return source.replace(anchor, `${anchor}${insertion}`);
}

function replaceRegexOrThrow(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`Could not find ${label}`);
  }

  return source.replace(pattern, replacement);
}

function extractAsar(archivePath, destination) {
  try {
    const asar = require('@electron/asar');
    asar.extractAll(archivePath, destination);
  } catch (error) {
    log(`Falling back to CLI asar extraction: ${error.message}`);
    runCommand('asar', ['extract', archivePath, destination]);
  }
}

function patchMainProcess(appDir) {
  const mainJsPath = path.join(appDir, 'main.js');
  let source = readText(mainJsPath);

  if (!source.startsWith("require('./linux.bootstrap');")) {
    source = `require('./linux.bootstrap');\n${source}`;
  }

  source = replaceOrThrow(
    source,
    "var isMac = process.platform === 'darwin';",
    "var isMac = process.platform === 'darwin';\nvar isWindows = process.platform === 'win32';\nvar isLinux = process.platform === 'linux';\nvar linuxSafeWindowMode = isLinux && process.env.RAKUTENLINK_LINUX_SAFE_WINDOW_MODE !== '0';",
    'platform flags'
  );

  source = insertAfterOrThrow(
    source,
    "var isLinux = process.platform === 'linux';\n",
    "if (isLinux) {\n    app.commandLine.appendSwitch('no-sandbox');\n    app.commandLine.appendSwitch('disable-setuid-sandbox');\n}\n",
    'Linux sandbox flags'
  );

  source = replaceOrThrow(
    source,
    "let slashes = isMac ? '/' : '\\\\';",
    "let slashes = isWindows ? '\\\\' : '/';",
    'path separator selection'
  );

  source = insertAfterOrThrow(
    source,
    "function attemptToFixPermissions(isDownloadsFolder, isDefaultLogsPath) {\n",
    "    if (isLinux) {\n        devToolsLog('attemptToFixPermissions skipped on Linux');\n        return 'success';\n    }\n",
    'Linux guard for permission repair'
  );

  source = insertAfterOrThrow(
    source,
    "function checkAndFixPermissionIssuesWithAutoUpdaterFolder() {\n",
    "    if (isLinux || process.env.RAKUTENLINK_DISABLE_UPDATER !== '0') {\n        return 'success';\n    }\n",
    'Linux guard for updater permission repair'
  );

  source = replaceRegexOrThrow(
    source,
    /function getAppCacheDir\(\) \{[\s\S]*?return cacheDir \|\| '';\n\}/,
    `function getAppCacheDir() {\n    const homedir = os.homedir();\n    let result;\n    if (isWindows) {\n        result = process.env["LOCALAPPDATA"] || path.join(homedir, "AppData", "Local");\n    } else if (isMac) {\n        result = path.join(homedir, "Library", "Application Support", "Caches");\n    } else {\n        result = process.env.XDG_CACHE_HOME || path.join(homedir, ".cache");\n    }\n    const cacheDir = path.join(result, 'rakuten-updater');\n    devToolsLog(\`Cache DIR electron :: \${cacheDir}\`);\n    return cacheDir || '';\n}`,
    'Linux-aware cache directory'
  );

  // v2.1.0 added `let successFlag = false;` above the log line, so match the
  // handler header and the first `if (!isMac) {` loosely instead of verbatim.
  source = replaceRegexOrThrow(
    source,
    /(ipcMain\.on\('run-bluetooth', \(event, data, timerValue, printID\) => \{\n(?:[^\n]*\n){1,4}?)(\s*)if \(!isMac\) \{/,
    (match, header, indent) =>
      `${header}${indent}if (isLinux && process.env.RAKUTENLINK_ENABLE_BLUETOOTH !== '1') {\n` +
      `${indent}    devToolsLog("bluetooth :: linux bluetooth disabled");\n` +
      `${indent}    if (win && win.webContents) {\n` +
      `${indent}        win.webContents.send('mdns-or-bluetooth-response', { value: 'unsupported', type: 'bluetooth' });\n` +
      `${indent}    }\n` +
      `${indent}    return;\n` +
      `${indent}}\n` +
      `${indent}if (isWindows) {`,
    'Linux guard for bluetooth scan handler'
  );

  source = replaceOrThrow(
    source,
    "    if(!isMac) {\n        return;\n    }\n",
    "    if (isLinux) {\n        if (win && win.webContents) {\n            win.webContents.send('bluetooth-permission-result', 'unsupported');\n        }\n        return;\n    }\n    if(!isMac) {\n        return;\n    }\n",
    'Linux guard for bluetooth permission handler'
  );

  source = replaceOrThrow(
    source,
    "            devToolsLog('on dom-ready, triggering white screencheck in renderer');\n            triggerWhiteScreenCheckInRenderer();\n            // patch fix by @abhinav white screen issue still exists on v13+ so, bringing this back\n            win.hide();\n            setTimeout(() => {\n                win.show();\n            }, 100);\n",
    // The window is created with show:false and paintWhenInitiallyHidden:false,
    // so 'ready-to-show' never fires and this hide/show is what first shows it.
    // Keep a single show() in safe mode instead of dropping it entirely.
    "            devToolsLog('on dom-ready, triggering white screencheck in renderer');\n            triggerWhiteScreenCheckInRenderer();\n            // The original hide/show flash is useful on macOS/Windows but causes severe flicker loops on Linux.\n            if (!linuxSafeWindowMode) {\n                win.hide();\n                setTimeout(() => {\n                    win.show();\n                }, 100);\n            } else if (!win.isVisible()) {\n                win.show();\n            }\n",
    'Linux-safe dom-ready show/hide behavior'
  );

  // v2.1.0 inserted a `trafficLightPosition` line between these options.
  source = replaceRegexOrThrow(
    source,
    /titleBarStyle: "hidden",(\n[^\n]*trafficLightPosition[^\n]*)?\n(\s*)frame: isMac,\n/,
    (match, trafficLight, indent) =>
      `titleBarStyle: isLinux ? "default" : "hidden",${trafficLight || ''}\n${indent}frame: isMac || isLinux,\n`,
    'Linux native frame for main window'
  );

  source = replaceOrThrow(
    source,
    "        if (type === 'critical' && win) {\n            if (!isMac && !win.isFocused()) {\n                win.minimize();\n            }\n",
    "        if (type === 'critical' && win) {\n            if (isWindows && !win.isFocused()) {\n                win.minimize();\n            }\n",
    'Linux-safe critical window visibility handling'
  );

  source = replaceOrThrow(
    source,
    "            setTimeout(() => {\n                win.focus();\n            }, 200);\n",
    "            if (!linuxSafeWindowMode) {\n                setTimeout(() => {\n                    win.focus();\n                }, 200);\n            }\n",
    'Linux-safe main window focus on show'
  );

  source = replaceOrThrow(
    source,
    "            if (!isQuitting && !isMac) {\n                devToolsLog('preventing default in on close');\n                event.preventDefault();\n                win.hide();\n                event.returnValue = false;\n                return false;\n            }\n",
    "            if (!isQuitting && !isMac && !linuxSafeWindowMode) {\n                devToolsLog('preventing default in on close');\n                event.preventDefault();\n                win.hide();\n                event.returnValue = false;\n                return false;\n            }\n",
    'Linux-safe close handling before tray mode'
  );

  source = replaceOrThrow(
    source,
    "            if(!closingAftergatheringData && isUserLoggedIn) {\n                event.preventDefault()\n                win.hide();\n                // app will close after gathering data\n                sendMessageToRenderer(win,'getDataBeforeAppClose','');\n            } else {\n",
    "            if(!closingAftergatheringData && isUserLoggedIn && !linuxSafeWindowMode) {\n                event.preventDefault()\n                win.hide();\n                // app will close after gathering data\n                sendMessageToRenderer(win,'getDataBeforeAppClose','');\n            } else {\n",
    'Linux-safe close handling after login'
  );

  source = replaceOrThrow(
    source,
    "    app.on('window-all-closed', function () {\n        devToolsLog('window all closed event called');\n        // On macOS specific close process\n        if (!isMac && win) {\n            win.hide();\n        }\n    });\n\n    // macOS specific close process\n    app.on('activate', function () {\n        if (!win) {\n            devToolsLog('win is null, activate event is triggered');\n            return;\n        }\n        win.show()\n",
    "    app.on('window-all-closed', function () {\n        devToolsLog('window all closed event called');\n        if (linuxSafeWindowMode) {\n            app.quit();\n            return;\n        }\n        // On macOS specific close process\n        if (!isMac && win) {\n            win.hide();\n        }\n    });\n\n    // macOS specific close process\n    app.on('activate', function () {\n        if (!win) {\n            devToolsLog('win is null, activate event is triggered');\n            return;\n        }\n        if (linuxSafeWindowMode) {\n            return;\n        }\n        win.show()\n",
    'Linux-safe activate/window-all-closed handling'
  );

  writeText(mainJsPath, source);
}

function patchChatPopoutWindow(appDir) {
  const chatPopoutPath = path.join(appDir, 'chat.popout.window.js');
  let source = readText(chatPopoutPath);

  source = replaceOrThrow(
    source,
    "let showDefaultTitleBar = \"hidden\";\n\tlet showFrame = isMac ? true : false;\n\tshowDefaultTitleBar = \"default\"\n\tshowFrame = true;\n",
    "let showDefaultTitleBar = isMac ? \"hidden\" : \"default\";\n\tlet showFrame = !isMac;\n",
    'Linux native frame for chat popout'
  );

  writeText(chatPopoutPath, source);
}

function patchCallPopoutWindow(appDir) {
  const callPopoutPath = path.join(appDir, 'call.popout.window.js');
  let source = readText(callPopoutPath);

  source = replaceOrThrow(
    source,
    "        titleBarStyle: \"hidden\",\n        frame: isMac,\n        fullscreenable: isMac,\n",
    "        titleBarStyle: isMac ? \"hidden\" : \"default\",\n        frame: !isMac,\n        fullscreenable: isMac,\n",
    'Linux native frame for call popout'
  );

  writeText(callPopoutPath, source);
}

function sanitizeRuntimePackage(appDir, manifest) {
  const runtimePackagePath = path.join(appDir, 'package.json');
  const originalPackage = JSON.parse(fs.readFileSync(runtimePackagePath, 'utf8'));

  const runtimePackage = {
    name: 'rakuten-link-linux-runtime',
    productName: originalPackage.productName || manifest.app.name || 'Rakuten Link',
    version: manifest.app.version || originalPackage.version || '0.0.0',
    description: 'Rakuten Link patched runtime for Linux startup verification',
    author: originalPackage.author || 'Rakuten Mobile, Inc.',
    main: 'main.js',
    license: originalPackage.license || 'UNLICENSED',
    private: true,
    asar: false,
    appId: originalPackage.appId || manifest.app.bundleIdentifier || 'jp.co.rakuten.link',
    uiToken: originalPackage.uiToken || undefined,
    dependencies: originalPackage.dependencies || {},
    overrides: originalPackage.overrides || undefined,
    rakutenLinkLinux: {
      sourceDmg: manifest.source.dmgFileName,
      sourceAsarSha256: manifest.integrity.appAsarSha256,
      patchedAt: new Date().toISOString(),
      updaterDisabledByDefault: true,
      bluetoothEnabledByDefault: false,
    },
  };

  writeJson(runtimePackagePath, runtimePackage);
}

function patchRuntime(existingManifest) {
  const manifest = existingManifest || (fs.existsSync(MANIFEST_PATH) ? readJson(MANIFEST_PATH) : extractVendor());
  const appAsarPath = path.join(ROOT_DIR, manifest.extracted.appAsar);

  requireFile(appAsarPath, 'Extracted app.asar');
  emptyDir(APP_DIR);
  extractAsar(appAsarPath, APP_DIR);

  fs.copyFileSync(path.join(PATCHES_DIR, 'linux.bootstrap.js'), path.join(APP_DIR, 'linux.bootstrap.js'));
  patchMainProcess(APP_DIR);
  patchChatPopoutWindow(APP_DIR);
  patchCallPopoutWindow(APP_DIR);
  sanitizeRuntimePackage(APP_DIR, manifest);

  log(`Patched runtime created at ${APP_DIR}`);
  return { appDir: APP_DIR, manifest };
}

module.exports = {
  patchRuntime,
};

if (require.main === module) {
  try {
    patchRuntime();
  } catch (error) {
    console.error(error.stack || error);
    process.exit(1);
  }
}
