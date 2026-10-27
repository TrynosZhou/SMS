import axios from 'axios';
import { validatePhoneNumber } from './phoneValidator';

export type WhatsAppSendResult = { ok: boolean; error?: string; skipped?: boolean; dryRun?: boolean };

function envFlagTrue(name: string): boolean {
  const v = String(process.env[name] || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function stripPlus(normalized: string): string {
  return normalized.replace(/^\+/, '');
}

/** Explicit dry-run mode (logs only; never calls Meta API). */
export function isWhatsAppDryRun(): boolean {
  return envFlagTrue('WHATSAPP_DRY_RUN');
}

/** Whether WhatsApp Cloud API credentials are present and live sending is enabled. */
export function isWhatsAppConfigured(): boolean {
  if (isWhatsAppDryRun()) return false;
  const token = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  return Boolean(token && phoneId);
}

/**
 * Normalize a phone number to E.164 (+263…) then strip + for Meta WhatsApp API.
 */
export function normalizeWhatsAppRecipient(phone: string | null | undefined): string | null {
  const raw = String(phone || '').trim();
  if (!raw) return null;
  const result = validatePhoneNumber(raw, false);
  if (!result.isValid || !result.normalized) return null;
  return stripPlus(result.normalized);
}

/**
 * Send a plain-text WhatsApp message via Meta WhatsApp Cloud API.
 * When WHATSAPP_DRY_RUN=true or credentials are missing, logs the message and returns skipped.
 */
export async function sendWhatsAppMessage(
  toPhone: string,
  body: string
): Promise<WhatsAppSendResult> {
  const to = normalizeWhatsAppRecipient(toPhone);
  if (!to) {
    return { ok: false, error: 'Invalid phone number' };
  }

  const dryRun = isWhatsAppDryRun();
  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const apiVersion = String(process.env.WHATSAPP_API_VERSION || 'v21.0').trim();
  const apiBase = String(process.env.WHATSAPP_API_URL || 'https://graph.facebook.com').replace(/\/$/, '');

  if (dryRun || !accessToken || !phoneNumberId) {
    const reason = dryRun
      ? 'WHATSAPP_DRY_RUN=true'
      : 'missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID';
    console.info(`[WhatsApp dry-run] (${reason}) To: ${to}\n${body}`);
    return { ok: true, skipped: true, dryRun: true };
  }

  try {
    const url = `${apiBase}/${apiVersion}/${phoneNumberId}/messages`;
    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );
    return { ok: true };
  } catch (err: any) {
    const apiMsg =
      err?.response?.data?.error?.message ||
      err?.response?.data?.message ||
      err?.message ||
      'Failed to send WhatsApp message';
    return { ok: false, error: String(apiMsg) };
  }
}

/** Small delay between sends to reduce rate-limit errors. */
export function whatsAppSendDelayMs(): number {
  const raw = Number(process.env.WHATSAPP_SEND_DELAY_MS || 350);
  return Number.isFinite(raw) && raw >= 0 ? raw : 350;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Opens WhatsApp app/web with a pre-filled message (fallback when Cloud API is unavailable). */
export function buildWhatsAppWebUrl(phone: string, body: string): string | null {
  const to = normalizeWhatsAppRecipient(phone);
  if (!to) return null;
  return `https://wa.me/${to}?text=${encodeURIComponent(body)}`;
}

/**
 * Upload a PDF buffer to Meta WhatsApp Cloud API's Media endpoint and return the
 * media_id. The media_id is then used to send a document message.
 */
export async function uploadWhatsAppMedia(
  pdfBuffer: Buffer,
  filename: string
): Promise<{ mediaId: string } | { error: string }> {
  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const apiVersion = String(process.env.WHATSAPP_API_VERSION || 'v21.0').trim();
  const apiBase = String(process.env.WHATSAPP_API_URL || 'https://graph.facebook.com').replace(/\/$/, '');

  if (!accessToken || !phoneNumberId) {
    return { error: 'WhatsApp credentials not configured' };
  }

  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', pdfBuffer, { filename, contentType: 'application/pdf' });
    form.append('messaging_product', 'whatsapp');
    form.append('type', 'application/pdf');

    const url = `${apiBase}/${apiVersion}/${phoneNumberId}/media`;
    const res = await axios.post(url, form, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...form.getHeaders()
      },
      timeout: 30000
    });
    const mediaId = res.data?.id;
    if (!mediaId) return { error: 'Media upload succeeded but no id returned' };
    return { mediaId };
  } catch (err: any) {
    const msg =
      err?.response?.data?.error?.message ||
      err?.response?.data?.message ||
      err?.message ||
      'Failed to upload media';
    return { error: String(msg) };
  }
}

/**
 * Send a PDF document to a WhatsApp number via Meta Cloud API.
 * Uploads the buffer first to get a media_id, then sends as a document message.
 * Returns `skipped: true` in dry-run mode (same as sendWhatsAppMessage).
 */
export async function sendWhatsAppDocument(
  toPhone: string,
  pdfBuffer: Buffer,
  filename: string,
  caption: string
): Promise<WhatsAppSendResult> {
  const to = normalizeWhatsAppRecipient(toPhone);
  if (!to) return { ok: false, error: 'Invalid phone number' };

  const dryRun = isWhatsAppDryRun();
  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const apiVersion = String(process.env.WHATSAPP_API_VERSION || 'v21.0').trim();
  const apiBase = String(process.env.WHATSAPP_API_URL || 'https://graph.facebook.com').replace(/\/$/, '');

  if (dryRun || !accessToken || !phoneNumberId) {
    const reason = dryRun ? 'WHATSAPP_DRY_RUN=true' : 'missing credentials';
    console.info(`[WhatsApp dry-run doc] (${reason}) To: ${to}, file: ${filename}\n${caption}`);
    return { ok: true, skipped: true, dryRun: true };
  }

  // Step 1: upload media
  const uploadResult = await uploadWhatsAppMedia(pdfBuffer, filename);
  if ('error' in uploadResult) {
    return { ok: false, error: uploadResult.error };
  }
  const { mediaId } = uploadResult;

  // Step 2: send document message
  try {
    const url = `${apiBase}/${apiVersion}/${phoneNumberId}/messages`;
    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'document',
        document: {
          id: mediaId,
          caption,
          filename
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );
    return { ok: true };
  } catch (err: any) {
    const msg =
      err?.response?.data?.error?.message ||
      err?.response?.data?.message ||
      err?.message ||
      'Failed to send document message';
    return { ok: false, error: String(msg) };
  }
}
