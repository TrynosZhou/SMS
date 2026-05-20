import type { jsPDF } from 'jspdf';

export interface PaymentBankingDetails {
  accountName: string;
  bankName: string;
  branch: string;
  accountNumber: string;
  paymentReferenceHint: string;
}

export function resolvePaymentBankingDetails(
  paymentBanking: Partial<PaymentBankingDetails> | null | undefined,
  schoolName?: string
): PaymentBankingDetails | null {
  const accountName = String(paymentBanking?.accountName || schoolName || '').trim();
  const bankName = String(paymentBanking?.bankName || '').trim();
  const branch = String(paymentBanking?.branch || '').trim();
  const accountNumber = String(paymentBanking?.accountNumber || '').trim();

  if (!accountName && !bankName && !branch && !accountNumber) {
    return null;
  }

  return {
    accountName: accountName || 'School',
    bankName: bankName || '—',
    branch: branch || '—',
    accountNumber: accountNumber || '—',
    paymentReferenceHint:
      String(paymentBanking?.paymentReferenceHint || '').trim() ||
      'Please use the account number as your payment reference.'
  };
}

/**
 * Draws payment / banking block on a jsPDF document (matches server PDF layout).
 * Returns Y position after the block (mm).
 */
export function drawPaymentBankingDetailsJsPdf(
  pdf: jsPDF,
  details: PaymentBankingDetails | null,
  startY: number
): number {
  if (!details) {
    return startY;
  }

  const boxX = 14;
  const boxW = 182;
  const headerH = 8;
  const rowH = 7;
  const footerH = 9;
  const blockHeight = headerH + rowH * 4 + footerH + 6;
  const pageBottom = 287;

  let yPos = startY;
  if (yPos + blockHeight > pageBottom) {
    pdf.addPage();
    yPos = 14;
  }

  const startBlockY = yPos;

  pdf.setFillColor(74, 144, 226);
  pdf.rect(boxX, startBlockY, boxW, headerH, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(255, 255, 255);
  pdf.text('PAYMENT / BANKING DETAILS', boxX + 3, startBlockY + 5.5);

  let rowY = startBlockY + headerH;
  const rows: Array<{ label: string; value: string; alt: boolean }> = [
    { label: 'Account name', value: details.accountName, alt: true },
    { label: 'Bank', value: details.bankName, alt: false },
    { label: 'Branch', value: details.branch, alt: true },
    { label: 'Account number', value: details.accountNumber, alt: false }
  ];

  rows.forEach((row) => {
    if (row.alt) {
      pdf.setFillColor(232, 244, 252);
    } else {
      pdf.setFillColor(255, 255, 255);
    }
    pdf.rect(boxX, rowY, boxW, rowH, 'F');
    pdf.setDrawColor(222, 226, 230);
    pdf.setLineWidth(0.2);
    pdf.rect(boxX, rowY, boxW, rowH, 'S');

    if (row.alt) {
      pdf.setTextColor(37, 99, 235);
    } else {
      pdf.setTextColor(51, 65, 85);
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text(row.label, boxX + 3, rowY + 4.5);

    pdf.setTextColor(row.alt ? 30 : 15, row.alt ? 64 : 23, row.alt ? 175 : 42);
    pdf.setFontSize(9);
    pdf.text(row.value, boxX + boxW - 3, rowY + 4.5, { align: 'right' });

    rowY += rowH;
  });

  pdf.setFillColor(232, 244, 252);
  pdf.rect(boxX, rowY, boxW, footerH, 'F');
  pdf.setDrawColor(191, 219, 254);
  pdf.rect(boxX, rowY, boxW, footerH, 'S');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(37, 99, 235);
  const hintLines = pdf.splitTextToSize(details.paymentReferenceHint, boxW - 6);
  pdf.text(hintLines, boxX + 3, rowY + 4);

  pdf.setTextColor(0, 0, 0);
  return rowY + footerH + 6;
}
