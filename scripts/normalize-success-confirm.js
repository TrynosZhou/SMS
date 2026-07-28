/**
 * Convert local success toasts into invisible bridges that only feed
 * SuccessConfirmService (global dialog). Also drop page-confirm success banners.
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
const files = walk(root);
let changedFiles = 0;

function replaceSuccessHosts(html) {
  // Replace opening tags that already have smsSuccessConfirm with a minimal bridge host.
  // Leave closing tags / inner content to a second pass that collapses common patterns.
  return html;
}

function collapseSuccessBlocks(html) {
  let out = html;
  let changed = false;

  // Pattern: element with *ngIf="success" (or success && ...) and smsSuccessConfirm — collapse to empty bridge
  const blockRe =
    /<(div|p|span)(\s[^>]*?(?:\*ngIf="success(?:\s*&&[^"]*)?"|\*ngIf='success(?:\s*&&[^']*)?')[^>]*?\[smsSuccessConfirm\][^>]*?)>([\s\S]*?)<\/\1>/g;

  out = out.replace(blockRe, (full, tag, attrs) => {
    // Extract clear binding if present
    const clearMatch = attrs.match(/\(smsSuccessConfirmClear\)="([^"]*)"/);
    const clear = clearMatch ? clearMatch[1] : "success = ''";
    const titleMatch = attrs.match(/\[smsSuccessTitle\]="([^"]*)"/);
    const titleAttr = titleMatch ? ` [smsSuccessTitle]="${titleMatch[1]}"` : '';
    const ngIfMatch = attrs.match(/\*ngIf="([^"]+)"/);
    const ngIf = ngIfMatch ? ngIfMatch[1] : 'success';
    changed = true;
    return `<span class="sms-success-bridge" *ngIf="${ngIf}" [smsSuccessConfirm]="success"${titleAttr} (smsSuccessConfirmClear)="${clear}" aria-hidden="true"></span>`;
  });

  // Also handle successMessage
  const blockMsgRe =
    /<(div|p|span)(\s[^>]*?\*ngIf="successMessage"[^>]*?)>([\s\S]*?)<\/\1>/g;
  out = out.replace(blockMsgRe, (full, tag, attrs, inner) => {
    if (attrs.includes('smsSuccessConfirm')) {
      changed = true;
      return `<span class="sms-success-bridge" *ngIf="successMessage" [smsSuccessConfirm]="successMessage" (smsSuccessConfirmClear)="successMessage = ''" aria-hidden="true"></span>`;
    }
    // Add directive if missing
    changed = true;
    return `<span class="sms-success-bridge" *ngIf="successMessage" [smsSuccessConfirm]="successMessage" (smsSuccessConfirmClear)="successMessage = ''" aria-hidden="true"></span>`;
  });

  // Toast stacks: success || error -> error only (success is now a bridge sibling)
  const stackPatterns = [
    [/\*ngIf="\(success \|\| error\) && !pageConfirmation"/g, '*ngIf="error"'],
    [/\*ngIf="\(success \|\| error \|\| loadError\)"/g, '*ngIf="error || loadError"'],
    [/\*ngIf="success \|\| error \|\| loadError"/g, '*ngIf="error || loadError"'],
    [/\*ngIf="success \|\| error \|\| tiersError"/g, '*ngIf="error || tiersError"'],
    [/\*ngIf="success \|\| error \|\| connectionBanner \|\| isAutoSaving"/g, '*ngIf="error || connectionBanner || isAutoSaving"'],
    [/\*ngIf="success \|\| error \|\| connectionBanner"/g, '*ngIf="error || connectionBanner"'],
    [/\*ngIf="success \|\| error \|\| autoSavingRemarks \|\| connectionBanner"/g, '*ngIf="error || autoSavingRemarks || connectionBanner"'],
    [/\*ngIf="successMessage \|\| error"/g, '*ngIf="error"'],
    [/\*ngIf="success \|\| error"/g, '*ngIf="error"'],
    [/\*ngIf="\(success \|\| error\)"/g, '*ngIf="error"'],
  ];
  for (const [re, rep] of stackPatterns) {
    if (re.test(out)) {
      out = out.replace(re, rep);
      changed = true;
    }
  }

  // Remove pageConfirmation banners entirely (success now uses global dialog; errors use toasts)
  const pageConfirmRe =
    /\n?\s*<div\s+class="[^"]*page-confirm[^"]*"[\s\S]*?<\/div>\s*(?=\n\s*<(?:header|div|section))/g;
  if (pageConfirmRe.test(out)) {
    out = out.replace(pageConfirmRe, '\n');
    changed = true;
  }

  return { out, changed };
}

for (const file of files) {
  let html = fs.readFileSync(file, 'utf8');
  const { out, changed } = collapseSuccessBlocks(html);
  if (changed) {
    fs.writeFileSync(file, out);
    changedFiles++;
    console.log('updated', path.relative(root, file));
  }
}

console.log(`Done. changedFiles=${changedFiles}`);
