import PDFDocument from 'pdfkit';
import { Settings } from '../entities/Settings';
import { CREST_LEDGER as T } from './invoicePdfTheme';

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

const HEADER_H = 28;
const ROW_H = 24;
const FOOTER_H = 30;
const BLOCK_PADDING = 14;

const COMPACT_HEADER_H = 20;
const COMPACT_ROW_H = 16;
const COMPACT_FOOTER_H = 20;

function bankingDimensions(compact?: boolean) {
  if (compact) {
    return { headerH: COMPACT_HEADER_H, rowH: COMPACT_ROW_H, footerH: COMPACT_FOOTER_H, padding: 0 };
  }
  return { headerH: HEADER_H, rowH: ROW_H, footerH: FOOTER_H, padding: BLOCK_PADDING };
}

/** Height of the payment/banking block in PDF points (0 if settings omit banking details). */
export function getPaymentBankingBlockHeight(settings: Settings | null, compact = false): number {
  if (!resolvePaymentBankingDetails(settings)) {
    return 0;
  }
  const { headerH, rowH, footerH, padding } = bankingDimensions(compact);
  return headerH + rowH * 4 + footerH + padding;
}

/**
 * Y position (top of block) to anchor banking details at the bottom of a page.
 */
export function getPaymentBankingAnchorY(
  pageHeight: number,
  bottomMargin: number,
  footerReserve: number,
  settings: Settings | null,
  compact = false
): number | null {
  const blockHeight = getPaymentBankingBlockHeight(settings, compact);
  if (blockHeight <= 0) {
    return null;
  }
  return pageHeight - bottomMargin - footerReserve - blockHeight;
}

/**
 * Draws the payment / banking details guide block (matches on-screen fee payment UI).
 * Returns the Y position after the block.
 */
export function drawPaymentBankingDetailsPdf(
  doc: InstanceType<typeof PDFDocument>,
  settings: Settings | null,
  yPos: number,
  options?: {
    fixedPosition?: boolean;
    pageIndex?: number;
    compact?: boolean;
    crestLedger?: boolean;
    boxX?: number;
    boxW?: number;
  }
): number {
  const details = resolvePaymentBankingDetails(settings);
  if (!details) {
    return yPos;
  }

  const crest = options?.crestLedger === true;
  const boxX = options?.boxX ?? 50;
  const boxW = options?.boxW ?? 500;
  const { headerH, rowH, footerH, padding } = bankingDimensions(options?.compact);
  const blockHeight = headerH + rowH * 4 + footerH;
  const pageBottom = doc.page.height - 65;

  let startY = yPos;

  if (options?.fixedPosition) {
    if (options.pageIndex !== undefined) {
      const range = doc.bufferedPageRange();
      const targetPage =
        options.pageIndex <= 0 ? range.start : Math.min(options.pageIndex, range.start + range.count - 1);
      doc.switchToPage(targetPage);
    }
    startY = yPos;
  } else if (yPos + blockHeight + padding > pageBottom) {
    doc.addPage();
    startY = 50;
  }

  doc.rect(boxX, startY, boxW, headerH).fill(crest ? T.navy : '#4A90E2');
  doc.fontSize(options?.compact ? 8 : 11)
    .font(crest ? T.sansBold : 'Helvetica-Bold')
    .fillColor(T.white);
  doc.text('PAYMENT / BANKING DETAILS', boxX + 12, startY + (options?.compact ? 6 : 9));

  let rowY = startY + headerH;
  const rows: Array<{ label: string; value: string; alt: boolean }> = [
    { label: 'Account name', value: details.accountName, alt: true },
    { label: 'Bank', value: details.bankName, alt: false },
    { label: 'Branch', value: details.branch, alt: true },
    { label: 'Account number', value: details.accountNumber, alt: false }
  ];

  const labelSize = options?.compact ? 7.5 : 9;
  const valueSize = options?.compact ? 8.5 : 10;
  const labelY = options?.compact ? 5 : 7;
  const valueY = options?.compact ? 4.5 : 6;

  rows.forEach((row) => {
    const rowFill = crest
      ? row.alt
        ? T.navyTint
        : T.ivory
      : row.alt
        ? '#E8F4FC'
        : '#FFFFFF';

    doc.rect(boxX, rowY, boxW, rowH).fill(rowFill);
    doc.rect(boxX, rowY, boxW, rowH).strokeColor(crest ? '#D8DCE8' : '#DEE2E6').lineWidth(0.5).stroke();

    if (crest) {
      doc.fontSize(labelSize).font(T.sansBold).fillColor(T.slateMuted);
      doc.text(row.label, boxX + 12, rowY + labelY);
      doc.fontSize(valueSize).font(T.sansBold).fillColor(T.slate);
    } else {
      doc.fontSize(labelSize).font('Helvetica-Bold').fillColor(row.alt ? '#2563EB' : '#334155');
      doc.text(row.label, boxX + 12, rowY + labelY);
      doc.fontSize(valueSize).font('Helvetica-Bold').fillColor(row.alt ? '#1E40AF' : '#0F172A');
    }
    doc.text(row.value, boxX + 130, rowY + valueY, { width: boxW - 142, align: 'right' });

    rowY += rowH;
  });

  doc.rect(boxX, rowY, boxW, footerH).fill(crest ? T.navyTint : '#E8F4FC');
  doc.rect(boxX, rowY, boxW, footerH).strokeColor(crest ? '#D8DCE8' : '#BFDBFE').lineWidth(0.5).stroke();

  if (crest) {
    doc.fontSize(options?.compact ? 6.5 : 8).font(T.serif).fillColor(T.slateMuted);
  } else {
    doc.fontSize(options?.compact ? 7 : 8).font('Helvetica').fillColor('#2563EB');
  }
  doc.text(details.paymentReferenceHint, boxX + 12, rowY + (options?.compact ? 7 : 10), { width: boxW - 24 });

  return rowY + footerH + (options?.fixedPosition ? 0 : padding);
}
