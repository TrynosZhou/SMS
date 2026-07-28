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
const files = walk(root);
let patched = 0;
let skipped = 0;

for (const file of files) {
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('smsSuccessConfirm')) {
    skipped++;
    continue;
  }

  let changed = false;

  // *ngIf="success"
  html = html.replace(/<(div|p|span)(\s[^>]*?\*ngIf="success"[^>]*?)>/g, (full, tag, attrs) => {
    if (attrs.includes('smsSuccessConfirm')) return full;
    changed = true;
    return `<${tag}${attrs} [smsSuccessConfirm]="success" (smsSuccessConfirmClear)="success = ''">`;
  });

  // *ngIf="success && ..."
  html = html.replace(
    /<(div|p|span)(\s[^>]*?\*ngIf="success\s*&&[^"]+"[^>]*?)>/g,
    (full, tag, attrs) => {
      if (attrs.includes('smsSuccessConfirm')) return full;
      changed = true;
      return `<${tag}${attrs} [smsSuccessConfirm]="success" (smsSuccessConfirmClear)="success = ''">`;
    }
  );

  if (changed) {
    fs.writeFileSync(file, html);
    patched++;
    console.log('patched', path.relative(root, file));
  }
}

console.log(`Done. patched=${patched} already=${skipped}`);
