#!/usr/bin/env node
// Renders the authored 我的 row icons to the PNG the mini program bundles.
//
// The SVG beside this script's source folder is the artwork authority: a
// stroke-only 24px grid icon. Browsers and Flutter draw their icons from vector
// paths in code, but the WeChat mini program cannot render SVG reliably, so its
// bundle ships a 4x anti-aliased PNG rendered here.
//
// Usage: node tools/render-care-icons.mjs
//
// Chrome (or Edge) renders each SVG headlessly at the final size. Set
// `SDKWORK_CHROME_PATH` when the browser is not installed in a standard
// location.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Edge length of the shipped icon, in pixels (displayed at 20-24px). */
const RENDER_SIZE = 96;

/** Mini program folder that owns the icon artwork and the rendered PNGs. */
const SOURCE_DIR = path.join(
  'apps',
  'sdkwork-doctor-mini-program',
  'src',
  'assets',
  'icons',
);

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
  if (width !== RENDER_SIZE || height !== RENDER_SIZE) {
    throw new Error(file + ' rendered ' + width + 'x' + height + ', expected ' + RENDER_SIZE + 'x' + RENDER_SIZE);
  }
  if (colorType !== 6) {
    throw new Error(file + ' is not RGBA; the icon needs a transparent surround');
  }
}

function render(browser, sourceFile, targetFile, scratchDir, profileDir) {
  const svg = fs.readFileSync(sourceFile, 'utf8');
  const html = [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}',
    'svg{display:block;width:' + RENDER_SIZE + 'px;height:' + RENDER_SIZE + 'px}</style>',
    '</head><body>' + svg + '</body></html>',
  ].join('');
  const page = path.join(scratchDir, path.basename(sourceFile, '.svg') + '.html');
  fs.writeFileSync(page, html, 'utf8');
  execFileSync(browser, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=' + RENDER_SIZE + ',' + RENDER_SIZE,
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
  const scratchDir = path.join(repoRoot, '.sdkwork', 'tmp', 'care-icons');
  const profileDir = path.join(scratchDir, 'browser-profile');
  fs.mkdirSync(scratchDir, { recursive: true });
  fs.mkdirSync(profileDir, { recursive: true });

  const sources = fs.readdirSync(sourceDir).filter((name) => name.endsWith('.svg')).sort();
  if (sources.length === 0) throw new Error('no icon SVG found in ' + sourceDir);

  for (const source of sources) {
    const name = path.basename(source, '.svg') + '.png';
    render(browser, path.join(sourceDir, source), path.join(sourceDir, name), scratchDir, profileDir);
    process.stdout.write(name + ' ' + fs.statSync(path.join(sourceDir, name)).size + ' bytes\n');
  }
}

main();
