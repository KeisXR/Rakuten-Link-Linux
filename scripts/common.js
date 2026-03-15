'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const GENERATED_DIR = path.join(ROOT_DIR, '.generated');
const SOURCE_DIR = path.join(GENERATED_DIR, 'source');
const WORK_DIR = path.join(GENERATED_DIR, 'work');
const APP_DIR = path.join(WORK_DIR, 'app');
const DIST_DIR = path.join(ROOT_DIR, 'release');
const PATCHES_DIR = path.join(ROOT_DIR, 'patches');
const MANIFEST_PATH = path.join(GENERATED_DIR, 'manifest.json');
const DMG_PATH = process.env.RAKUTENLINK_DMG || path.join(ROOT_DIR, 'RakutenLink.dmg');

function log(message) {
  console.log(`[rakuten-link] ${message}`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function emptyDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeText(filePath, contents) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, contents);
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function relativeFromRoot(filePath) {
  return path.relative(ROOT_DIR, filePath);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT_DIR,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    maxBuffer: options.maxBuffer || (16 * 1024 * 1024),
  });

  if (result.error && result.status === null) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status}\n${result.stdout || ''}${result.stderr || ''}`
    );
  }

  return result;
}

function findBundlePaths(dmgPath) {
  const listing = runCommand('7z', ['l', dmgPath]).stdout.split(/\r?\n/);
  const filePaths = listing
    .map((line) => {
      const match = line.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[^\s]+\s+\d+\s+\d+\s+(.*)$/);
      return match ? match[1].trim() : null;
    })
    .filter(Boolean);

  const infoPlistPath = filePaths.find(
    (candidate) =>
      candidate.endsWith('/Info.plist') &&
      candidate.includes('.app/Contents/Info.plist') &&
      !candidate.includes('/Frameworks/')
  );

  if (!infoPlistPath) {
    throw new Error('Could not locate Rakuten Link.app Info.plist inside the DMG');
  }

  const bundleRoot = infoPlistPath.replace(/\/Contents\/Info\.plist$/, '');

  return {
    bundleRoot,
    infoPlistPath,
    appUpdatePath: `${bundleRoot}/Contents/Resources/app-update.yml`,
    appAsarPath: `${bundleRoot}/Contents/Resources/app.asar`,
  };
}

function extractFromDmg(relativePath) {
  ensureDir(SOURCE_DIR);
  runCommand('7z', ['x', '-y', `-o${SOURCE_DIR}`, DMG_PATH, relativePath]);
  return path.join(SOURCE_DIR, relativePath);
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

module.exports = {
  APP_DIR,
  DIST_DIR,
  DMG_PATH,
  GENERATED_DIR,
  MANIFEST_PATH,
  PATCHES_DIR,
  ROOT_DIR,
  SOURCE_DIR,
  WORK_DIR,
  emptyDir,
  ensureDir,
  extractFromDmg,
  findBundlePaths,
  log,
  readJson,
  readText,
  relativeFromRoot,
  requireFile,
  runCommand,
  sha256File,
  writeJson,
  writeText,
};
