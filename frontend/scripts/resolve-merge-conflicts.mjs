import fs from 'fs';
import path from 'path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'src');
const conflictRe = /<<<<<<< HEAD\s*\r?\n([\s\S]*?)=======\s*\r?\n[\s\S]*?>>>>>>>[^\r\n]*\s*\r?\n?/g;

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (/\.(ts|html|css|json)$/.test(name)) files.push(full);
  }
  return files;
}

let fixed = 0;
let unresolved = [];

for (const file of walk(root)) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('<<<<<<< HEAD')) continue;

  let prev;
  do {
    prev = content;
    content = content.replace(conflictRe, '$1');
  } while (content !== prev && content.includes('<<<<<<< HEAD'));

  if (content.includes('<<<<<<< HEAD')) {
    unresolved.push(path.relative(root, file));
    continue;
  }

  fs.writeFileSync(file, content, 'utf8');
  fixed++;
}

console.log(`Resolved: ${fixed}`);
if (unresolved.length) {
  console.log(`Unresolved (${unresolved.length}):`);
  unresolved.forEach((f) => console.log('  ' + f));
  process.exit(1);
}
