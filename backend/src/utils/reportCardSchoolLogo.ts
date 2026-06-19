import { Settings } from '../entities/Settings';

/** Primary logo from System Settings (Logo 1). */
export function getReportCardPrimaryLogo(settings: Settings | null | undefined): string | null {
  const raw = settings?.schoolLogo ?? null;
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed || null;
}

/** Secondary logo from System Settings (Logo 2). */
export function getReportCardSecondaryLogo(settings: Settings | null | undefined): string | null {
  const raw = settings?.schoolLogo2 ?? null;
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed || null;
}

/** Decode a data:image/*;base64,... URL to a buffer for PDFKit. */
export function decodeSchoolLogoBuffer(rawLogo: string | null | undefined): Buffer | null {
  if (!rawLogo) return null;
  let v = String(rawLogo).trim();
  if (!v) return null;

  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  v = v.replace(/\\n/g, '').replace(/\\r/g, '').replace(/\\t/g, '').replace(/\\"/g, '"');

  if (!v.startsWith('data:image')) {
    return null;
  }

  const comma = v.indexOf(',');
  if (comma < 0) return null;
  const payload = v.slice(comma + 1).replace(/\s/g, '');
  if (!payload) return null;

  try {
    return Buffer.from(payload, 'base64');
  } catch {
    return null;
  }
}
