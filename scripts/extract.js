'use strict';

const fs = require('fs');
const path = require('path');
const {
  DMG_PATH,
  GENERATED_DIR,
  MANIFEST_PATH,
  SOURCE_DIR,
  emptyDir,
  extractFromDmg,
  findBundlePaths,
  log,
  readText,
  relativeFromRoot,
  requireFile,
  sha256File,
  writeJson,
} = require('./common');

function readPlistString(contents, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = contents.match(new RegExp(`<key>${escapedKey}</key>\\s*<string>([^<]+)</string>`));
  return match ? match[1] : null;
}

function parseUpdateYml(contents) {
  const update = {};

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.+)$/);
    if (match) {
      update[match[1]] = match[2];
    }
  }

  return update;
}

function extractVendor() {
  requireFile(DMG_PATH, 'Rakuten Link DMG');

  emptyDir(GENERATED_DIR);
  fs.mkdirSync(SOURCE_DIR, { recursive: true });

  const bundlePaths = findBundlePaths(DMG_PATH);
  const infoPlistPath = extractFromDmg(bundlePaths.infoPlistPath);
  const appUpdatePath = extractFromDmg(bundlePaths.appUpdatePath);
  const appAsarPath = extractFromDmg(bundlePaths.appAsarPath);

  const infoPlist = readText(infoPlistPath);
  const appUpdate = readText(appUpdatePath);

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: {
      dmgFileName: path.basename(DMG_PATH),
      dmgPath: path.resolve(DMG_PATH),
      bundleRoot: bundlePaths.bundleRoot,
    },
    extracted: {
      infoPlist: relativeFromRoot(infoPlistPath),
      appUpdateYml: relativeFromRoot(appUpdatePath),
      appAsar: relativeFromRoot(appAsarPath),
    },
    app: {
      name: readPlistString(infoPlist, 'CFBundleDisplayName') || 'Rakuten Link',
      version: readPlistString(infoPlist, 'CFBundleShortVersionString') || '0.0.0',
      bundleIdentifier: readPlistString(infoPlist, 'CFBundleIdentifier') || 'jp.co.rakuten.link',
      executable: readPlistString(infoPlist, 'CFBundleExecutable') || 'Rakuten Link',
    },
    update: parseUpdateYml(appUpdate),
    integrity: {
      appAsarSha256: sha256File(appAsarPath),
    },
  };

  writeJson(MANIFEST_PATH, manifest);
  log(`Extracted ${manifest.app.name} ${manifest.app.version}`);
  log(`App.asar SHA-256 ${manifest.integrity.appAsarSha256}`);

  return manifest;
}

module.exports = {
  extractVendor,
};

if (require.main === module) {
  try {
    extractVendor();
  } catch (error) {
    console.error(error.stack || error);
    process.exit(1);
  }
}
