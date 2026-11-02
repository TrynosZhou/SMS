import { Settings } from '../entities/Settings';

/** Primary logo from System Settings (Logo 1). */
export function getReportCardPrimaryLogo(settings: Settings | null | undefined): string | null {
  const raw = settings?.schoolLogo ?? null;
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed || null;
}

/** Secondary logo from System Settings (Logo 2) — report cards only. */
export function getReportCardSecondaryLogo(settings: Settings | null | undefined): string | null {
  const raw = settings?.schoolLogo2 ?? null;
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed || null;
}

/** Primary logo for all documents except report-card secondary banner. */
export function getPrimarySchoolLogo(settings: Settings | null | undefined): string | null {
  return getReportCardPrimaryLogo(settings);
}

/** Cache for decoded logo buffers to avoid repeated base64 decoding. */
const logoBufferCache = new Map<string, Buffer | null>();

/** Decode a data:image/*;base64,... URL to a buffer for PDFKit. */
export function decodeSchoolLogoBuffer(rawLogo: string | null | undefined): Buffer | null {
  if (!rawLogo) return null;
  const vRaw = String(rawLogo).trim();
  if (!vRaw) return null;

  // Check cache first
  if (logoBufferCache.has(vRaw)) {
    return logoBufferCache.get(vRaw) ?? null;
  }

  let v = vRaw;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  v = v.replace(/\\n/g, '').replace(/\\r/g, '').replace(/\\t/g, '').replace(/\\"/g, '"');

  if (!v.startsWith('data:image')) {
    logoBufferCache.set(vRaw, null);
    return null;
  }

  const comma = v.indexOf(',');
  if (comma < 0) {
    logoBufferCache.set(vRaw, null);
    return null;
  }
  const payload = v.slice(comma + 1).replace(/\s/g, '');
  if (!payload) {
    logoBufferCache.set(vRaw, null);
    return null;
  }

  try {
    // Large base64 strings can cause Buffer.from to crash if they exceed memory limits.
    if (payload.length > 50 * 1024 * 1024) { // 50MB safety limit
      console.warn('[decodeSchoolLogoBuffer] Logo payload is too large, skipping to prevent crash.');
      logoBufferCache.set(vRaw, null);
      return null;
    }
    const buffer = Buffer.from(payload, 'base64');
    
    // Basic magic byte check to ensure it's a valid image buffer (JPEG, PNG, GIF, WEBP)
    const isJpeg = buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    const isPng  = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    const isGif  = buffer.length > 3 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
    const isWebp = buffer.length > 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;

    if (!isJpeg && !isPng && !isGif && !isWebp) {
      console.warn('[decodeSchoolLogoBuffer] Invalid image format (no valid magic bytes), skipping.');
      logoBufferCache.set(vRaw, null);
      return null;
    }

    logoBufferCache.set(vRaw, buffer);
    return buffer;
  } catch (err) {
    console.error('[decodeSchoolLogoBuffer] Error decoding logo:', err);
    logoBufferCache.set(vRaw, null);
    return null;
  }
}
