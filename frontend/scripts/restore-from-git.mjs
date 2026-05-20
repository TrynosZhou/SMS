import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const srcRoot = path.resolve(__dirname, '..', 'src');
const commit = process.argv[2] || '8706589';
const conflictRe = /<<<<<<< HEAD\s*\r?\n([\s\S]*?)=======\s*\r?\n[\s\S]*?>>>>>>>[^\r\n]*\s*\r?\n?/g;

function resolve(content) {
  let out = content;
  let prev;
  do {
    prev = out;
    out = out.replace(conflictRe, '$1');
  } while (out !== prev && out.includes('<<<<<<< HEAD'));
  return out;
}

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, files);
    else if (/\.(ts|html|css)$/.test(name)) files.push(full);
  }
  return files;
}

let restored = 0;
let failed = [];

for (const full of walk(srcRoot)) {
  const rel = path.relative(path.join(repoRoot, 'frontend'), full).replace(/\\/g, '/');
  let raw;
  try {
    raw = execSync(`git show ${commit}:frontend/${rel}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch {
    continue;
  }

  if (!raw.includes('<<<<<<< HEAD') && !raw.includes('=======')) continue;

  const resolved = resolve(raw);
  if (resolved.includes('<<<<<<< HEAD')) {
    failed.push(rel);
    continue;
  }

  fs.writeFileSync(full, resolved, 'utf8');
  restored++;
}

console.log(`Restored ${restored} files from ${commit}`);
if (failed.length) {
  console.log(`Still conflicted (${failed.length}):`);
  failed.slice(0, 20).forEach((f) => console.log('  ' + f));
}
