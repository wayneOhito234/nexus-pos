#!/usr/bin/env node
/**
 * Restructure script for nexus-pos, prepping apps/server for cPanel's
 * Node.js Selector deployment.
 *
 * Run this from the ROOT of your local nexus-pos repo clone:
 *   node restructure-for-cpanel.js
 *
 * What it does:
 *   1. Removes stray 0-byte junk files created by mis-pasted terminal
 *      commands (curl, curl.exe, "next()", node) from apps/server.
 *   2. Rewrites apps/server/package.json so the @nexus-pos/shared
 *      dependency uses a relative file: reference instead of a bare
 *      version number — this is what makes `npm install` work when
 *      cPanel runs it inside apps/server alone, without workspace context.
 *   3. Adds an "engines" field so the Node version is explicit.
 *   4. Leaves apps/terminal and apps/manager untouched — they're Electron
 *      desktop apps and don't get deployed to cPanel.
 *
 * After running, review the diff, then commit and push:
 *   git add -A
 *   git commit -m "Restructure apps/server for cPanel deployment"
 *   git push
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SERVER_DIR = path.join(ROOT, 'apps', 'server');

function log(msg) {
  console.log(`  ${msg}`);
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

console.log('Nexus POS — cPanel restructure\n');

// --- Sanity check we're in the right place ---
if (!fs.existsSync(SERVER_DIR)) {
  fail(`apps/server not found. Run this script from the repo root (where package.json with "workspaces" lives).`);
}

// --- Step 1: remove known junk files ---
console.log('Step 1: Removing stray junk files from apps/server');
const JUNK_FILES = ['curl', 'curl.exe', 'next()', 'node'];
let removedCount = 0;

for (const name of JUNK_FILES) {
  const filePath = path.join(SERVER_DIR, name);
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    if (stat.isFile() && stat.size === 0) {
      fs.unlinkSync(filePath);
      log(`removed apps/server/${name}`);
      removedCount++;
    } else {
      log(`skipped ${name} — not a 0-byte file, check manually before deleting`);
    }
  }
}
if (removedCount === 0) log('none found (already clean)');

// --- Step 2: fix the shared package dependency ---
console.log('\nStep 2: Fixing @nexus-pos/shared dependency reference');
const pkgPath = path.join(SERVER_DIR, 'package.json');
if (!fs.existsSync(pkgPath)) fail('apps/server/package.json not found');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

if (pkg.dependencies && pkg.dependencies['@nexus-pos/shared']) {
  const current = pkg.dependencies['@nexus-pos/shared'];
  if (current.startsWith('file:')) {
    log('already using a file: reference, no change needed');
  } else {
    pkg.dependencies['@nexus-pos/shared'] = 'file:../../packages/shared';
    log(`changed "@nexus-pos/shared": "${current}" -> "file:../../packages/shared"`);
  }
} else {
  log('warning: @nexus-pos/shared not found in dependencies — check manually');
}

// --- Step 3: pin engines so cPanel's Node selector matches what you tested ---
console.log('\nStep 3: Setting engines field');
if (!pkg.engines || !pkg.engines.node) {
  pkg.engines = { ...(pkg.engines || {}), node: '>=20.0.0' };
  log('added "engines": { "node": ">=20.0.0" } — adjust to match your cPanel Node.js version');
} else {
  log(`engines.node already set to "${pkg.engines.node}", leaving as is`);
}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
log('wrote apps/server/package.json');

// --- Step 4: verify packages/shared exists and matches ---
console.log('\nStep 4: Verifying packages/shared');
const sharedPkgPath = path.join(ROOT, 'packages', 'shared', 'package.json');
if (!fs.existsSync(sharedPkgPath)) {
  fail('packages/shared/package.json not found — the file: reference will break');
}
const sharedPkg = JSON.parse(fs.readFileSync(sharedPkgPath, 'utf8'));
log(`found ${sharedPkg.name}@${sharedPkg.version} at packages/shared`);

// --- Step 5: reminder about apps/server/.env.example ---
console.log('\nStep 5: Environment variables reminder');
const envExamplePath = path.join(SERVER_DIR, '.env.example');
if (fs.existsSync(envExamplePath)) {
  log('apps/server/.env.example exists — use it as the checklist for env vars');
  log('to add in cPanel\'s Node.js App "Environment Variables" section');
  log('(do NOT upload a real .env file to the server)');
}

console.log('\nDone. Review the changes, then:');
console.log('  git add -A');
console.log('  git commit -m "Restructure apps/server for cPanel deployment"');
console.log('  git push');
console.log('\nIn cPanel\'s Setup Node.js App:');
console.log('  Application root:    <your-repo-folder>/apps/server');
console.log('  Application startup: src/index.js');
