/**
 * Move sms-success-bridge elements outside *ngIf="error" toast stacks
 * so success dialogs still open when there is no error.
 */
const fs = require('fs');
const path = require('path');

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (ent.name.endsWith('.html')) files.push(p);
  }
  return files;
}

const root = path.join(__dirname, '..', 'frontend', 'src', 'app');
let changedFiles = 0;

const bridgeRe = /<span class="sms-success-bridge"[^>]*><\/span>\s*/g;

for (const file of walk(root)) {
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('sms-success-bridge')) continue;

  let changed = false;
  const bridges = [];
  html = html.replace(bridgeRe, (m) => {
    bridges.push(m.trim());
    changed = true;
    return '';
  });

  if (!bridges.length) continue;

  // Deduplicate identical bridges
  const unique = [...new Set(bridges)];
  const inject = unique.join('\n') + '\n';

  // Prefer injecting right after the opening root wrapper of the template
  // If file starts with a root element, insert after its opening tag.
  const openMatch = html.match(/^(\s*<[a-zA-Z][^>]*>\s*)/);
  if (openMatch) {
    html = html.replace(openMatch[0], openMatch[0] + inject);
  } else {
    html = inject + html;
  }

  fs.writeFileSync(file, html);
  changedFiles++;
  console.log('fixed', path.relative(root, file), `(${unique.length} bridge(s))`);
}

console.log(`Done. changedFiles=${changedFiles}`);
