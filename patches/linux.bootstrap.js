'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const EventEmitter = require('events');

if (process.platform !== 'linux') {
  return;
}

if (global.__rakutenLinkLinuxBootstrapApplied) {
  return;
}

global.__rakutenLinkLinuxBootstrapApplied = true;

const originalLoad = Module._load;
const updaterDisabled = process.env.RAKUTENLINK_DISABLE_UPDATER !== '0';
const bluetoothEnabled = process.env.RAKUTENLINK_ENABLE_BLUETOOTH === '1';
const safeWindowMode = process.env.RAKUTENLINK_LINUX_SAFE_WINDOW_MODE !== '0';
const suppressVendorStdout = process.env.RAKUTENLINK_SUPPRESS_VENDOR_STDOUT !== '0';
const stateHome = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
const logDir = path.join(stateHome, 'rakuten-link-linux');
const logFile = path.join(logDir, 'bootstrap.log');
const windowState = new Map();
let mainWindowId = null;
let suppressedStdoutLines = 0;
let suppressedStderrLines = 0;

function appendBootstrapLog(message) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`);
  } catch (error) {
    process.stderr.write(`[rakuten-link-bootstrap] ${message}\n`);
    process.stderr.write(`${error.stack || error}\n`);
  }
}

function createAutoUpdaterStub() {
  const emitter = new EventEmitter();
  emitter.checkForUpdatesAndNotify = async () => null;
  emitter.updateNotificationLanguage = () => undefined;
  emitter.addClickListner = () => undefined;
  emitter.quitAndInstall = () => {
    appendBootstrapLog('autoUpdater.quitAndInstall() skipped on Linux');
  };
  return emitter;
}

function createNobleStub() {
  const emitter = new EventEmitter();
  emitter.state = 'unsupported';
  emitter.startScanningAsync = async () => {
    appendBootstrapLog('Bluetooth scan skipped on Linux stub');
    return false;
  };
  emitter.stopScanningAsync = async () => false;
  return emitter;
}

function wrapMethod(target, methodName, fallbackValue) {
  if (!target) {
    return;
  }

  const original = typeof target[methodName] === 'function' ? target[methodName].bind(target) : null;
  target[methodName] = (...args) => {
    if (!original) {
      return fallbackValue;
    }

    try {
      return original(...args);
    } catch (error) {
      appendBootstrapLog(`${methodName} failed on Linux: ${error.stack || error}`);
      return fallbackValue;
    }
  };
}

function isSuppressedVendorLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  return /^\d{1,2}:\d{2}:\d{2}\.\d{3}\s+[›>]\s+[A-Za-z0-9+/=]{32,}$/.test(trimmed);
}

function installOutputFilter(stream, streamName) {
  if (!stream || typeof stream.write !== 'function' || !suppressVendorStdout) {
    return;
  }

  const originalWrite = stream.write.bind(stream);
  let pending = '';

  stream.write = (chunk, encoding, callback) => {
    const maybeCallback = typeof encoding === 'function' ? encoding : callback;
    const text = Buffer.isBuffer(chunk)
      ? chunk.toString(typeof encoding === 'string' ? encoding : 'utf8')
      : typeof chunk === 'string'
        ? chunk
        : null;

    if (text == null) {
      return originalWrite(chunk, encoding, callback);
    }

    pending += text;
    const segments = pending.split(/\n/);
    pending = segments.pop() || '';

    let forwarded = '';
    for (const segment of segments) {
      const line = `${segment}\n`;
      if (isSuppressedVendorLine(segment)) {
        if (streamName === 'stdout') {
          suppressedStdoutLines += 1;
          if (suppressedStdoutLines === 1 || suppressedStdoutLines % 50 === 0) {
            appendBootstrapLog(`Suppressed ${suppressedStdoutLines} obfuscated stdout line(s)`);
          }
        } else {
          suppressedStderrLines += 1;
          if (suppressedStderrLines === 1 || suppressedStderrLines % 50 === 0) {
            appendBootstrapLog(`Suppressed ${suppressedStderrLines} obfuscated stderr line(s)`);
          }
        }
        continue;
      }
      forwarded += line;
    }

    if (forwarded.length > 0) {
      return originalWrite(forwarded, 'utf8', maybeCallback);
    }

    if (typeof maybeCallback === 'function') {
      maybeCallback();
    }
    return true;
  };
}

function getWindowState(win) {
  if (!win || typeof win.id !== 'number') {
    return null;
  }

  let state = windowState.get(win.id);
  if (!state) {
    state = {
      lastShowAt: 0,
      lastFocusAt: 0,
    };
    windowState.set(win.id, state);
  }

  return state;
}

function describeWindow(win) {
  if (!win) {
    return 'unknown-window';
  }

  try {
    if (typeof win.isDestroyed === 'function' && win.isDestroyed()) {
      return `id=${win.id || 'unknown'} destroyed=true`;
    }

    const bounds = typeof win.getBounds === 'function' ? win.getBounds() : null;
    const title = typeof win.getTitle === 'function' ? win.getTitle() : '';
    return `id=${win.id} title=${JSON.stringify(title)} bounds=${bounds ? `${bounds.width}x${bounds.height}@${bounds.x},${bounds.y}` : 'unknown'}`;
  } catch (error) {
    return `id=${win.id || 'unknown'} detail-error=${error.message}`;
  }
}

function markMainWindowCandidate(win) {
  if (mainWindowId !== null || !win) {
    return;
  }

  try {
    const bounds = typeof win.getBounds === 'function' ? win.getBounds() : null;
    if (!bounds || (bounds.width >= 700 && bounds.height >= 600)) {
      mainWindowId = win.id;
      appendBootstrapLog(`Selected main window candidate ${describeWindow(win)}`);
    }
  } catch (error) {
    appendBootstrapLog(`Failed to mark main window candidate: ${error.stack || error}`);
  }
}

function isMainWindow(win) {
  return Boolean(win && mainWindowId !== null && win.id === mainWindowId);
}

function shouldDebounceWindowCall(win, key, thresholdMs) {
  const state = getWindowState(win);
  if (!state) {
    return false;
  }

  const now = Date.now();
  if (now - state[key] < thresholdMs) {
    return true;
  }

  state[key] = now;
  return false;
}

function wrapBrowserWindowMethod(BrowserWindow, methodName, wrapper) {
  if (!BrowserWindow || !BrowserWindow.prototype) {
    return;
  }

  const original = BrowserWindow.prototype[methodName];
  if (typeof original !== 'function') {
    return;
  }

  BrowserWindow.prototype[methodName] = function patchedBrowserWindowMethod(...args) {
    return wrapper.call(this, original, args);
  };
}

function attachWindowLogging(win) {
  if (!win) {
    return;
  }

  markMainWindowCandidate(win);
  getWindowState(win);

  const lifecycleEvents = [
    'ready-to-show',
    'show',
    'hide',
    'focus',
    'blur',
    'close',
    'closed',
    'minimize',
    'restore',
    'maximize',
    'unmaximize',
  ];

  lifecycleEvents.forEach((eventName) => {
    win.on(eventName, () => {
      appendBootstrapLog(`[window:${eventName}] ${describeWindow(win)}`);
      if (eventName === 'closed') {
        windowState.delete(win.id);
      }
    });
  });
}

function patchElectron() {
  let electron;

  try {
    electron = originalLoad('electron', module, false);
  } catch (error) {
    appendBootstrapLog(`Failed to load electron during bootstrap: ${error.stack || error}`);
    return;
  }

  if (electron.app) {
    wrapMethod(electron.app, 'setLoginItemSettings', undefined);
    wrapMethod(electron.app, 'setAsDefaultProtocolClient', false);
    wrapMethod(electron.app, 'removeAsDefaultProtocolClient', false);
    electron.app.on('browser-window-created', (event, win) => {
      attachWindowLogging(win);
    });
  }

  if (electron.BrowserWindow && electron.BrowserWindow.prototype) {
    if (typeof electron.BrowserWindow.prototype.setAppDetails !== 'function') {
      electron.BrowserWindow.prototype.setAppDetails = () => undefined;
    } else {
      wrapMethod(electron.BrowserWindow.prototype, 'setAppDetails', undefined);
    }

    wrapBrowserWindowMethod(electron.BrowserWindow, 'show', function wrapShow(original, args) {
      markMainWindowCandidate(this);
      if (safeWindowMode && isMainWindow(this) && shouldDebounceWindowCall(this, 'lastShowAt', 400)) {
        appendBootstrapLog(`Suppressed repeated show() on Linux main window: ${describeWindow(this)}`);
        return undefined;
      }

      return original.apply(this, args);
    });

    wrapBrowserWindowMethod(electron.BrowserWindow, 'focus', function wrapFocus(original, args) {
      markMainWindowCandidate(this);
      if (safeWindowMode && isMainWindow(this) && shouldDebounceWindowCall(this, 'lastFocusAt', 400)) {
        appendBootstrapLog(`Suppressed repeated focus() on Linux main window: ${describeWindow(this)}`);
        return undefined;
      }

      return original.apply(this, args);
    });

    wrapBrowserWindowMethod(electron.BrowserWindow, 'hide', function wrapHide(original, args) {
      markMainWindowCandidate(this);
      if (safeWindowMode && isMainWindow(this)) {
        appendBootstrapLog(`Suppressed hide() on Linux main window: ${describeWindow(this)}`);
        return undefined;
      }

      return original.apply(this, args);
    });

    wrapBrowserWindowMethod(electron.BrowserWindow, 'minimize', function wrapMinimize(original, args) {
      markMainWindowCandidate(this);
      if (safeWindowMode && isMainWindow(this)) {
        appendBootstrapLog(`Suppressed minimize() on Linux main window: ${describeWindow(this)}`);
        return undefined;
      }

      return original.apply(this, args);
    });
  }

  if (electron.systemPreferences) {
    const originalStatus = typeof electron.systemPreferences.getMediaAccessStatus === 'function'
      ? electron.systemPreferences.getMediaAccessStatus.bind(electron.systemPreferences)
      : null;
    const originalAsk = typeof electron.systemPreferences.askForMediaAccess === 'function'
      ? electron.systemPreferences.askForMediaAccess.bind(electron.systemPreferences)
      : null;

    electron.systemPreferences.getMediaAccessStatus = (mediaType) => {
      try {
        return originalStatus ? originalStatus(mediaType) : 'granted';
      } catch (error) {
        appendBootstrapLog(`getMediaAccessStatus(${mediaType}) failed: ${error.stack || error}`);
        return 'granted';
      }
    };

    electron.systemPreferences.askForMediaAccess = async (mediaType) => {
      try {
        return originalAsk ? originalAsk(mediaType) : true;
      } catch (error) {
        appendBootstrapLog(`askForMediaAccess(${mediaType}) failed: ${error.stack || error}`);
        return true;
      }
    };
  }

  if (electron.shell && typeof electron.shell.openExternal === 'function') {
    const originalOpenExternal = electron.shell.openExternal.bind(electron.shell);
    electron.shell.openExternal = async (target, options) => {
      if (typeof target === 'string' && /^(ms-settings:|x-apple\.systempreferences:)/.test(target)) {
        appendBootstrapLog(`Ignoring OS-specific settings URL on Linux: ${target}`);
        return false;
      }

      try {
        return await originalOpenExternal(target, options);
      } catch (error) {
        appendBootstrapLog(`shell.openExternal(${target}) failed: ${error.stack || error}`);
        return false;
      }
    };
  }

  if (electron.nativeImage && typeof electron.nativeImage.createFromPath === 'function') {
    const originalCreateFromPath = electron.nativeImage.createFromPath.bind(electron.nativeImage);

    electron.nativeImage.createFromPath = (inputPath) => {
      if (typeof inputPath === 'string' && inputPath.endsWith('.ico')) {
        const candidatePngs = [
          inputPath.replace(/32_tray\.ico$/, 'LinkAppIcon_48.png'),
          inputPath.replace(/\.ico$/, '.png'),
        ];

        for (const candidate of candidatePngs) {
          if (candidate !== inputPath && fs.existsSync(candidate)) {
            appendBootstrapLog(`Replacing ICO icon with PNG fallback: ${candidate}`);
            return originalCreateFromPath(candidate);
          }
        }
      }

      return originalCreateFromPath(inputPath);
    };
  }
}

process.on('uncaughtExceptionMonitor', (error) => {
  appendBootstrapLog(`uncaughtExceptionMonitor: ${error.stack || error}`);
});

process.on('unhandledRejection', (reason) => {
  appendBootstrapLog(`unhandledRejection: ${reason && reason.stack ? reason.stack : reason}`);
});

const nobleStub = createNobleStub();
const autoUpdaterStub = createAutoUpdaterStub();

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@abandonware/noble') {
    if (!bluetoothEnabled) {
      appendBootstrapLog('Using noble stub on Linux');
      return nobleStub;
    }

    try {
      return originalLoad.apply(this, arguments);
    } catch (error) {
      appendBootstrapLog(`Falling back to noble stub after load failure: ${error.stack || error}`);
      return nobleStub;
    }
  }

  if (request === 'electron-updater' && updaterDisabled) {
    appendBootstrapLog('Using autoUpdater stub on Linux');
    return { autoUpdater: autoUpdaterStub };
  }

  if (request === 'electron-windows-badge') {
    appendBootstrapLog('Using windows badge stub on Linux');
    return function WindowsBadgeStub() {
      return undefined;
    };
  }

  return originalLoad.apply(this, arguments);
};

installOutputFilter(process.stdout, 'stdout');
installOutputFilter(process.stderr, 'stderr');

patchElectron();

appendBootstrapLog(
  `Linux bootstrap active updaterDisabled=${updaterDisabled} bluetoothEnabled=${bluetoothEnabled} safeWindowMode=${safeWindowMode} suppressVendorStdout=${suppressVendorStdout} cwd=${process.cwd()}`
);
