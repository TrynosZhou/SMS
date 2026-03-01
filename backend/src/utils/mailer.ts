type SendMailResult = { ok: boolean; error?: string };

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<SendMailResult> {
  try {
    const host = process.env.SMTP_HOST;
    const portRaw = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || user;

    if (!host || !portRaw || !user || !pass || !from) {
      return { ok: false, error: 'SMTP is not configured' };
    }

    const port = Number(portRaw);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    let nodemailer: any;
    try {
      // Prefer CommonJS require when available.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      nodemailer = require('nodemailer');
    } catch (e: any) {
      try {
        // Fallback for ESM-only nodemailer versions.
        const imported = await import('nodemailer');
        nodemailer = (imported as any).default || imported;
      } catch (e2: any) {
        return {
          ok: false,
          error: `Failed to load nodemailer: ${e2?.message || e?.message || 'Unknown error'}`
        };
      }
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    });

    const subject = 'Password Reset - School Management System';
    const text = `You requested a password reset.\n\nOpen this link to reset your password (valid for 1 hour):\n${resetLink}\n\nIf you did not request this, please ignore this email.`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Password Reset</h2>
        <p>You requested a password reset for your School Management System account.</p>
        <p><strong>This link is valid for 1 hour.</strong></p>
        <p>
          <a href="${resetLink}" style="display:inline-block;padding:10px 14px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
            Reset Password
          </a>
        </p>
        <p>If the button does not work, copy and paste this link into your browser:</p>
        <p><code>${resetLink}</code></p>
        <p>If you did not request this, please ignore this email.</p>
      </div>
    `;

    await transporter.sendMail({ from, to, subject, text, html });

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to send email' };
  }
}
