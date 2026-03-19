const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyIfChanged(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Source worker not found: ${src}`);
  }
  const destDir = path.dirname(dest);
  ensureDir(destDir);

  const same =
    fs.existsSync(dest) &&
    fs.statSync(dest).size === fs.statSync(src).size &&
    fs.statSync(dest).mtimeMs >= fs.statSync(src).mtimeMs;

  if (!same) {
    fs.copyFileSync(src, dest);
  }
}

try {
  const src = path.resolve(__dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs');
  const dest = path.resolve(__dirname, '..', 'src', 'assets', 'pdf.worker.min.mjs');
  copyIfChanged(src, dest);
  // eslint-disable-next-line no-console
  console.log('[postinstall] Copied PDF.js worker to assets.');
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn('[postinstall] PDF.js worker copy skipped:', e && e.message ? e.message : e);
}

