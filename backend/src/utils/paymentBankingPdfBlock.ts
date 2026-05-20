import PDFDocument from 'pdfkit';
import { Settings } from '../entities/Settings';

export interface PaymentBankingDetails {
  accountName: string;
  bankName: string;
  branch: string;
  accountNumber: string;
  paymentReferenceHint: string;
}

export function resolvePaymentBankingDetails(settings: Settings | null): PaymentBankingDetails | null {
  const pb = (settings?.feesSettings as { paymentBanking?: Partial<PaymentBankingDetails> } | null)
    ?.paymentBanking;

  const accountName = String(pb?.accountName || settings?.schoolName || '').trim();
  const bankName = String(pb?.bankName || '').trim();
  const branch = String(pb?.branch || '').trim();
  const accountNumber = String(pb?.accountNumber || '').trim();

  if (!accountName && !bankName && !branch && !accountNumber) {
    return null;
  }

  return {
    accountName: accountName || 'School',
    bankName: bankName || '—',
    branch: branch || '—',
    accountNumber: accountNumber || '—',
    paymentReferenceHint:
      String(pb?.paymentReferenceHint || '').trim() ||
      'Please use the account number as your payment reference.'
  };
}

/**
 * Draws the payment / banking details guide block (matches on-screen fee payment UI).
 * Returns the Y position after the block.
 */
export function drawPaymentBankingDetailsPdf(
  doc: InstanceType<typeof PDFDocument>,
  settings: Settings | null,
  yPos: number
): number {
  const details = resolvePaymentBankingDetails(settings);
  if (!details) {
    return yPos;
  }

  const boxX = 50;
  const boxW = 500;
  const headerH = 28;
  const rowH = 24;
  const footerH = 30;
  const blockHeight = headerH + rowH * 4 + footerH + 12;
  const pageBottom = doc.page.height - 65;

  if (yPos + blockHeight > pageBottom) {
    doc.addPage();
    yPos = 50;
  }

  const startY = yPos;

  doc.rect(boxX, startY, boxW, headerH).fill('#4A90E2');
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#FFFFFF');
  doc.text('PAYMENT / BANKING DETAILS', boxX + 12, startY + 9);

  let rowY = startY + headerH;
  const rows: Array<{ label: string; value: string; alt: boolean }> = [
    { label: 'Account name', value: details.accountName, alt: true },
    { label: 'Bank', value: details.bankName, alt: false },
    { label: 'Branch', value: details.branch, alt: true },
    { label: 'Account number', value: details.accountNumber, alt: false }
  ];

  rows.forEach((row) => {
    doc.rect(boxX, rowY, boxW, rowH)
      .fill(row.alt ? '#E8F4FC' : '#FFFFFF')
      .strokeColor('#DEE2E6')
      .lineWidth(0.5)
      .stroke();

    doc.fontSize(9).font('Helvetica-Bold').fillColor(row.alt ? '#2563EB' : '#334155');
    doc.text(row.label, boxX + 12, rowY + 7);

    doc.fontSize(10).font('Helvetica-Bold').fillColor(row.alt ? '#1E40AF' : '#0F172A');
    doc.text(row.value, boxX + 130, rowY + 6, { width: boxW - 142, align: 'right' });

    rowY += rowH;
  });

  doc.rect(boxX, rowY, boxW, footerH)
    .fill('#E8F4FC')
    .strokeColor('#BFDBFE')
    .lineWidth(0.5)
    .stroke();

  doc.fontSize(8).font('Helvetica').fillColor('#2563EB');
  doc.text(details.paymentReferenceHint, boxX + 12, rowY + 10, { width: boxW - 24 });

  return rowY + footerH + 14;
}
