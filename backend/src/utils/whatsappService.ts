import axios from 'axios';
import { validatePhoneNumber } from './phoneValidator';

export type WhatsAppSendResult = { ok: boolean; error?: string; skipped?: boolean };

function stripPlus(normalized: string): string {
  return normalized.replace(/^\+/, '');
}

/** Whether WhatsApp Cloud API credentials are present in the environment. */
export function isWhatsAppConfigured(): boolean {
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
 * When not configured, logs the message in development and returns skipped.
 */
export async function sendWhatsAppMessage(
  toPhone: string,
  body: string
): Promise<WhatsAppSendResult> {
  const to = normalizeWhatsAppRecipient(toPhone);
  if (!to) {
    return { ok: false, error: 'Invalid phone number' };
  }

  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const apiVersion = String(process.env.WHATSAPP_API_VERSION || 'v21.0').trim();
  const apiBase = String(process.env.WHATSAPP_API_URL || 'https://graph.facebook.com').replace(/\/$/, '');

  if (!accessToken || !phoneNumberId) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[WhatsApp dry-run] To: ${to}\n${body}`);
    }
    return { ok: true, skipped: true };
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

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
