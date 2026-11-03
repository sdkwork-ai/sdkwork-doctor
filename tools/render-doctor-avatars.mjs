#!/usr/bin/env node
// Renders the authored doctor portraits to the PNG every client bundles.
//
// The SVG beside this script's source folder is the artwork authority: it is a
// flat vector portrait that stays editable. Browsers could load it directly, but
// the Flutter app and the WeChat mini program cannot render SVG without extra
// dependencies, so the canonical raster is a PNG that every client ships.
//
// Usage: node tools/render-doctor-avatars.mjs
//
// Chrome (or Edge) renders each SVG headlessly at the final size, so the raster
// is anti-aliased from the vector source instead of being resampled from a
// larger bitmap. Set `SDKWORK_CHROME_PATH` when the browser is not installed in
// a standard location.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Edge length of the shipped portrait, in pixels. */
const AVATAR_RENDER_SIZE = 256;

/** Contract package that owns the authored roster and its portrait artwork. */
const SOURCE_DIR = path.join(
  'apps',
  'sdkwork-doctor-common',
  'packages',
  'sdkwork-doctor-common-doctor',
  'assets',
  'avatars',
);

/** Bundle directories every client loads `avatars/<doctor>.png` from. */
const CLIENT_TARGETS = [
  path.join('apps', 'sdkwork-doctor-pc', 'public', 'avatars'),
  path.join('apps', 'sdkwork-doctor-h5', 'public', 'avatars'),
  path.join('apps', 'sdkwork-doctor-mini-program', 'src', 'assets', 'avatars'),
  path.join('apps', 'sdkwork-doctor-flutter-mobile', 'assets', 'avatars'),
];

const CHROME_CANDIDATES = [
  process.env.SDKWORK_CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

function findBrowser() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  throw new Error('No Chrome or Edge found; set SDKWORK_CHROME_PATH to a Chromium binary.');
}

/** Validates the rendered PNG: signature, IHDR size, and an RGBA color type. */
function inspectPng(file) {
  const header = fs.readFileSync(file).subarray(0, 29);
  const signature = '89504e470d0a1a0a';
  if (header.subarray(0, 8).toString('hex') !== signature) {
    throw new Error(file + ' is not a PNG');
  }
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  const colorType = header[25];
  if (width !== AVATAR_RENDER_SIZE || height !== AVATAR_RENDER_SIZE) {
    throw new Error(file + ' rendered ' + width + 'x' + height + ', expected ' + AVATAR_RENDER_SIZE + 'x' + AVATAR_RENDER_SIZE);
  }
  if (colorType !== 6) {
    throw new Error(file + ' is not RGBA; the portrait needs a transparent surround');
  }
}

function render(browser, sourceFile, targetFile, scratchDir, profileDir) {
  const svg = fs.readFileSync(sourceFile, 'utf8');
  const html = [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}',
    'svg{display:block;width:' + AVATAR_RENDER_SIZE + 'px;height:' + AVATAR_RENDER_SIZE + 'px}</style>',
    '</head><body>' + svg + '</body></html>',
  ].join('');
  const page = path.join(scratchDir, path.basename(sourceFile, '.svg') + '.html');
  fs.writeFileSync(page, html, 'utf8');
  execFileSync(browser, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=' + AVATAR_RENDER_SIZE + ',' + AVATAR_RENDER_SIZE,
    '--default-background-color=00000000',
    '--screenshot=' + targetFile,
    '--user-data-dir=' + profileDir,
    pathToFileURL(page).href,
  ], { stdio: 'ignore' });
  if (!fs.existsSync(targetFile)) throw new Error('rendering ' + sourceFile + ' produced no PNG');
  inspectPng(targetFile);
}

function main() {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const sourceDir = path.join(repoRoot, SOURCE_DIR);
  const browser = findBrowser();
  const scratchDir = path.join(repoRoot, '.sdkwork', 'tmp', 'doctor-avatars');
  const profileDir = path.join(scratchDir, 'browser-profile');
  fs.mkdirSync(scratchDir, { recursive: true });
  fs.mkdirSync(profileDir, { recursive: true });

  const sources = fs.readdirSync(sourceDir).filter((name) => name.endsWith('.svg')).sort();
  if (sources.length === 0) throw new Error('no avatar SVG found in ' + sourceDir);

  const rendered = [];
  for (const source of sources) {
    const name = path.basename(source, '.svg') + '.png';
    const canonical = path.join(sourceDir, name);
    render(browser, path.join(sourceDir, source), canonical, scratchDir, profileDir);
    rendered.push({ name, canonical });
  }

  for (const target of CLIENT_TARGETS) {
    const targetDir = path.join(repoRoot, target);
    fs.mkdirSync(targetDir, { recursive: true });
    for (const file of rendered) {
      fs.copyFileSync(file.canonical, path.join(targetDir, file.name));
    }
  }

  for (const file of rendered) {
    const bytes = fs.statSync(file.canonical).size;
    process.stdout.write(file.name + ' ' + bytes + ' bytes -> ' + CLIENT_TARGETS.length + ' client bundles\n');
  }
}

main();
