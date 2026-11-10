#!/usr/bin/env node
/**
 * Prune node_modules down to the packages the production container needs at
 * RUNTIME (not build time). Run inside the builder stage after `npm run build`
 * and `npm prune --omit=dev`, before the runner copies node_modules.
 *
 * Everything Next.js bundles into .next (react-dom, lucide-react, jspdf, ...)
 * does not need to exist in node_modules at runtime. What must stay:
 * - next itself (next start) and its runtime deps (e.g. @next/env)
 * - the serverExternalPackages from next.config.ts (Prisma stack, better-sqlite3)
 * - the tools docker-startup.sh runs at container start (prisma CLI, tsx, ...)
 *
 * The dependency closure is computed from package-lock.json, so transitive
 * deps of the roots are kept automatically.
 */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.cwd();
const NM = path.join(ROOT_DIR, 'node_modules');

const ROOTS = [
  'next',
  'react',
  'react-dom',
  'sharp',
  'prisma',
  '@prisma/client',
  '@prisma/adapter-pg',
  '@prisma/adapter-better-sqlite3',
  'better-sqlite3',
  'tsx',
  'dotenv',
  'web-push',
  'csv-parse',
  'jsonwebtoken',
];

// Dead weight on the Alpine (musl) image: the glibc variants of the native
// binaries are never loaded. The musl SWC binary must stay: next start loads
// next.config.ts through SWC at runtime.
const DROP = new Set([
  '@next/swc-linux-x64-gnu',
  '@img/sharp-libvips-linux-x64',
]);

const lock = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package-lock.json'), 'utf8'));
const lockPackages = lock.packages || {};

const keep = new Set(['node_modules/.bin', 'node_modules/.prisma', 'node_modules/.package-lock.json']);
const queue = ROOTS.map((r) => `node_modules/${r}`);

function resolveDep(fromKey, dep) {
  let dir = fromKey;
  while (dir.includes('node_modules')) {
    const candidate = `${dir}/node_modules/${dep}`;
    if (lockPackages[candidate]) return candidate;
    dir = dir.slice(0, dir.lastIndexOf('node_modules') - 1);
  }
  const top = `node_modules/${dep}`;
  return lockPackages[top] ? top : null;
}

while (queue.length) {
  const key = queue.shift();
  if (keep.has(key) || DROP.has(key.replace(/^node_modules\//, ''))) continue;
  keep.add(key);
  const entry = lockPackages[key];
  if (!entry) continue;
  const deps = Object.keys(entry.dependencies || {}).concat(Object.keys(entry.optionalDependencies || {}));
  for (const dep of deps) {
    const resolved = resolveDep(key, dep);
    if (resolved && !keep.has(resolved)) queue.push(resolved);
  }
}

let removed = 0;
function removeDir(p) {
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    removed++;
  }
}

for (const entry of fs.readdirSync(NM)) {
  if (entry.startsWith('@')) {
    const scopeDir = path.join(NM, entry);
    for (const pkg of fs.readdirSync(scopeDir)) {
      const rel = `${entry}/${pkg}`;
      if (!keep.has(`node_modules/${rel}`)) removeDir(path.join(scopeDir, pkg));
    }
  } else if (!keep.has(`node_modules/${entry}`)) {
    removeDir(path.join(NM, entry));
  }
}

console.log(`docker-prune-runner-modules: kept ${keep.size} lock entries, removed ${removed} top-level entries`);
