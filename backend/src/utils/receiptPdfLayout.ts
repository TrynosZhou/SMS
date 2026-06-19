import PDFDocument from 'pdfkit';
import { Invoice } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { parseAmount } from './numberUtils';
import { RECEIPT_THEME as T } from './receiptPdfTheme';

export interface ReceiptLineItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface ReceiptTotals {
  totalInvoiceAmount: number;
  previousBalance: number;
  totalPaid: number;
  remainingBalance: number;
  prepaidAmount: number;
}

/** Build charge line items — same sources as the legacy receipt PDF. */
export function collectReceiptLineItems(
  invoice: Invoice,
  student: Student,
  settings: Settings | null
): ReceiptLineItem[] {
  const items: Array<{ label: string; amount: number }> = [];
  const feesSettings = settings?.feesSettings || {};
  const descriptionText = (invoice.description || '').toString();
  const tryNumLocal = (v: unknown) => (isFinite(Number(v)) ? Number(v) : 0);

  if (Array.isArray((invoice as any).items) && (invoice as any).items.length > 0) {
    (invoice as any).items.forEach((it: any) => {
      const label = (it.item || it.description || 'Item').toString();
      const amount = tryNumLocal(it.amount);
      if (amount > 0) {
        items.push({ label, amount });
      }
    });
  }

  const tuitionAmount = tryNumLocal((invoice as any).tuitionAmount);
  if (tuitionAmount > 0 && !items.find((i) => i.label.toLowerCase().includes('tuition'))) {
    const tuitionLabel = student.studentType === 'Boarder' ? 'Tuition fee (boarder)' : 'Tuition fee (day scholar)';
    items.push({ label: tuitionLabel, amount: tuitionAmount });
  }

  const diningHallAmount = tryNumLocal((invoice as any).diningHallAmount);
  if (diningHallAmount > 0 && !items.find((i) => i.label.toLowerCase().includes('dining'))) {
    const dhLabel =
      student.isStaffChild || student.isExempted ? 'Dining hall (DH) fee (50%)' : 'Dining hall (DH) fee';
    items.push({ label: dhLabel, amount: diningHallAmount });
  }

  const transportAmount = tryNumLocal((invoice as any).transportAmount || (invoice as any).transportCost);
  if (transportAmount > 0 && !items.find((i) => i.label.toLowerCase().includes('transport'))) {
    items.push({ label: 'Transport fee', amount: transportAmount });
  }

  if (items.length === 0) {
    items.push({ label: 'Fees', amount: tryNumLocal(invoice.amount) });
  }

  const formatShort = (v: number) => (Math.round(v * 100) % 100 === 0 ? String(Math.round(v)) : v.toFixed(2));
  let registrationFromDesc = 0;
  let deskFromDesc = 0;
  if (descriptionText.trim()) {
    const regMatch = descriptionText.match(/Registration Fee:\s*([0-9]+(?:\.[0-9]+)?)/i);
    const deskMatch = descriptionText.match(/Desk Fee:\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (regMatch) {
      const val = parseFloat(regMatch[1]);
      if (Number.isFinite(val)) registrationFromDesc = val;
    }
    if (deskMatch) {
      const val = parseFloat(deskMatch[1]);
      if (Number.isFinite(val)) deskFromDesc = val;
    }
  }

  const normalizedStatus = String((student as any).studentStatus || '')
    .trim()
    .toLowerCase();
  const isNewStudent = normalizedStatus === 'new';
  if (!student.isStaffChild && !student.isExempted && isNewStudent) {
    const regVal = registrationFromDesc > 0 ? registrationFromDesc : 0;
    const deskVal = deskFromDesc > 0 ? deskFromDesc : 0;
    if (regVal > 0 || deskVal > 0) {
      const label = `Desk fee + registration fee (${formatShort(deskVal)}+${formatShort(regVal)})`;
      items.push({ label, amount: regVal + deskVal });
    }
  }

  return items
    .filter((row) => row.amount > 0)
    .map((row) => ({
      description: row.label,
      quantity: 1,
      rate: row.amount,
      amount: row.amount
    }));
}

/** Canonical receipt totals — same formula as invoice statement preview. */
export function computeReceiptTotals(
  invoice: Invoice,
  student: Student,
  settings: Settings | null
): ReceiptTotals {
  const tryNum = (v: unknown) => (isFinite(Number(v)) ? Number(v) : 0);
  const invoiceAmount = tryNum(invoice.amount);
  let previousBalance = tryNum(invoice.previousBalance);
  const paidAmount = tryNum(invoice.paidAmount);
  const prepaidAmount = tryNum(invoice.prepaidAmount);

  const normalizedStatus = String((student as any).studentStatus || '')
    .trim()
    .toLowerCase();
  const isNewStudent = normalizedStatus === 'new';
  const configuredDeskFee = tryNum((settings as any)?.feesSettings?.deskFee);

  if (!isNewStudent && configuredDeskFee > 0) {
    const prev = Number(previousBalance.toFixed(2));
    const desk = Number(configuredDeskFee.toFixed(2));
    if (prev === desk) {
      previousBalance = 0;
    }
  }

  const totalInvoiceAmount = invoiceAmount + previousBalance;
  const totalPaid = paidAmount;
  const remainingBalance = Math.max(0, totalInvoiceAmount - totalPaid - prepaidAmount);

  return {
    totalInvoiceAmount,
    previousBalance,
    totalPaid,
    remainingBalance,
    prepaidAmount
  };
}

type Doc = InstanceType<typeof PDFDocument>;

export function formatReceiptMoney(currencySymbol: string, amount: number): string {
  const sym = currencySymbol || '';
  return `${sym} ${amount.toFixed(2)}`.trim();
}

export function drawThinRule(doc: Doc, x: number, y: number, width: number): void {
  doc.strokeColor(T.divider).lineWidth(0.5);
  doc.moveTo(x, y).lineTo(x + width, y).stroke();
}

/** Primary logo from settings (`schoolLogo`), then secondary (`schoolLogo2`). */
export function decodeReceiptLogoBuffer(settings: Settings | null): Buffer | null {
  const raw = String(settings?.schoolLogo || settings?.schoolLogo2 || '').trim();
  if (!raw.startsWith('data:image')) {
    return null;
  }
  const base64Data = raw.split(',')[1];
  if (!base64Data) {
    return null;
  }
  try {
    return Buffer.from(base64Data, 'base64');
  } catch {
    return null;
  }
}

export function drawReceiptPageLogo(
  doc: Doc,
  settings: Settings | null,
  pageX: number,
  pageY: number,
  size = 52
): number {
  const logoBuffer = decodeReceiptLogoBuffer(settings);
  if (!logoBuffer) {
    return 0;
  }
  try {
    doc.image(logoBuffer, pageX, pageY, { width: size, height: size });
    return size + 10;
  } catch (error) {
    console.error('Could not add school logo to receipt:', error);
    return 0;
  }
}

/** Render the modern flat receipt body inside a pre-sized card area. */
export function renderModernReceiptBody(options: {
  doc: Doc;
  cardX: number;
  cardY: number;
  cardW: number;
  pad: number;
  schoolName: string;
  schoolAddress: string;
  receiptNumber: string;
  invoiceNumber: string;
  paymentDate: Date;
  term: string;
  payerName: string;
  studentNumber: string;
  className: string;
  currencySymbol: string;
  paymentMethod?: string;
  paymentAmountToday: number;
  isPrepayment?: boolean;
  notes?: string;
  lineItems: ReceiptLineItem[];
  totals: ReceiptTotals;
}): number {
  const {
    doc,
    cardX,
    cardY,
    cardW,
    pad,
    schoolName,
    schoolAddress,
    receiptNumber,
    invoiceNumber,
    paymentDate,
    term,
    payerName,
    studentNumber,
    className,
    currencySymbol,
    paymentMethod,
    paymentAmountToday,
    isPrepayment,
    notes,
    lineItems,
    totals
  } = options;

  const innerW = cardW - pad * 2;
  let y = cardY + pad;

  const drawDivider = () => {
    drawThinRule(doc, cardX + pad, y, innerW);
    y += 14;
  };

  // ── 1. Centered header ─────────────────────────────────────────────
  doc.fontSize(18).font(T.sansBold).fillColor(T.text);
  doc.text(schoolName, cardX + pad, y, { width: innerW, align: 'center' });
  y += 22;

  if (schoolAddress) {
    doc.fontSize(12).font(T.sans).fillColor(T.muted);
    doc.text(schoolAddress, cardX + pad, y, { width: innerW, align: 'center' });
    y += 16;
  }

  doc.fontSize(9).font(T.sans).fillColor(T.muted);
  doc.text('Payment receipt', cardX + pad, y, { width: innerW, align: 'center', characterSpacing: 0.8 });
  y += 18;

  drawDivider();

  // ── 2. Two-column meta (inline label / value pairs) ────────────────
  const halfW = innerW / 2;
  const metaRowH = 16;

  const drawMetaRow = (leftLabel: string, leftVal: string, rightLabel: string, rightVal: string) => {
    const leftX = cardX + pad;
    const rightX = cardX + pad + halfW;
    const labelW = 58;

    doc.fontSize(8.5).font(T.sans).fillColor(T.muted);
    doc.text(leftLabel, leftX, y, { width: labelW, lineBreak: false });
    doc.fontSize(9).font(T.monoBold).fillColor(T.text);
    doc.text(leftVal, leftX + labelW, y, { width: halfW - labelW - 8, align: 'left', lineBreak: false });

    doc.fontSize(8.5).font(T.sans).fillColor(T.muted);
    doc.text(rightLabel, rightX, y, { width: labelW - 6, lineBreak: false });
    doc.fontSize(9).font(T.monoBold).fillColor(T.text);
    doc.text(rightVal, rightX + labelW - 6, y, { width: halfW - labelW, align: 'right', lineBreak: false });

    y += metaRowH;
  };

  drawMetaRow('Receipt no.', receiptNumber, 'Date', paymentDate.toLocaleDateString());
  drawMetaRow('Invoice no.', invoiceNumber, 'Term', term || '—');
  y += 4;
  drawDivider();

  // ── 3. Received from ───────────────────────────────────────────────
  doc.fontSize(8.5).font(T.sans).fillColor(T.muted);
  doc.text('Received from', cardX + pad, y);
  y += 12;

  doc.fontSize(11).font(T.sansBold).fillColor(T.text);
  doc.text(payerName, cardX + pad, y);
  y += 14;

  const studentMeta = [studentNumber ? `Student no. ${studentNumber}` : '', className ? className : '']
    .filter(Boolean)
    .join('  ·  ');
  if (studentMeta) {
    doc.fontSize(9).font(T.sans).fillColor(T.muted);
    doc.text(studentMeta, cardX + pad, y);
    y += 16;
  }

  drawDivider();

  // ── 4. Itemized table ──────────────────────────────────────────────
  const colDesc = innerW * 0.46;
  const colQty = 36;
  const colRate = 72;
  const colAmt = innerW - colDesc - colQty - colRate;
  const tableX = cardX + pad;
  const headerH = 18;
  const rowH = 20;

  doc.fontSize(8).font(T.sans).fillColor(T.muted);
  doc.text('Description', tableX, y + 4, { width: colDesc });
  doc.text('Qty', tableX + colDesc, y + 4, { width: colQty, align: 'right' });
  doc.text('Rate', tableX + colDesc + colQty, y + 4, { width: colRate, align: 'right' });
  doc.text('Amount', tableX + colDesc + colQty + colRate, y + 4, { width: colAmt, align: 'right' });
  y += headerH;
  drawThinRule(doc, tableX, y, innerW);
  y += 6;

  lineItems.forEach((row) => {
    doc.fontSize(9).font(T.sans).fillColor(T.text);
    doc.text(row.description, tableX, y + 3, { width: colDesc - 4, ellipsis: true });
    doc.font(T.mono).fillColor(T.text);
    doc.text(String(row.quantity), tableX + colDesc, y + 3, { width: colQty, align: 'right' });
    doc.text(formatReceiptMoney(currencySymbol, row.rate), tableX + colDesc + colQty, y + 3, {
      width: colRate,
      align: 'right'
    });
    doc.font(T.monoBold);
    doc.text(formatReceiptMoney(currencySymbol, row.amount), tableX + colDesc + colQty + colRate, y + 3, {
      width: colAmt,
      align: 'right'
    });
    y += rowH;
  });

  drawThinRule(doc, tableX, y, innerW);
  y += 14;

  // ── 5. Totals block ────────────────────────────────────────────────
  const totalsLabelW = innerW * 0.62;
  const totalsValW = innerW - totalsLabelW;
  const totalsX = cardX + pad;

  const drawTotalLine = (label: string, amount: number, bold = false) => {
    doc.fontSize(9).font(bold ? T.sansBold : T.sans).fillColor(T.text);
    doc.text(label, totalsX, y, { width: totalsLabelW, lineBreak: false });
    doc.font(bold ? T.monoBold : T.mono).fillColor(T.text);
    doc.text(formatReceiptMoney(currencySymbol, amount), totalsX + totalsLabelW, y, {
      width: totalsValW,
      align: 'right',
      lineBreak: false
    });
    y += 14;
  };

  drawTotalLine('Total invoice amount', totals.totalInvoiceAmount);
  drawTotalLine('Balance brought forward', totals.previousBalance);
  y += 2;
  drawThinRule(doc, totalsX, y, innerW);
  y += 10;
  drawTotalLine('Total paid to date', totals.totalPaid, true);
  drawTotalLine('Balance carried forward', totals.remainingBalance, true);

  if (totals.prepaidAmount > 0) {
    drawTotalLine('Prepaid amount', totals.prepaidAmount);
  }

  y += 8;

  // ── 6. Amount paid bar (green accent) ──────────────────────────────
  const paidBarH = 44;
  const paidBarR = 10;
  doc.roundedRect(cardX + pad, y, innerW, paidBarH, paidBarR).fill(T.greenBg);

  const methodLabel = paymentMethod || 'Payment';
  const todayLabel = isPrepayment ? 'Prepaid' : 'Today';
  doc.fontSize(9).font(T.sans).fillColor(T.greenText);
  doc.text(`${methodLabel}  ·  ${todayLabel}`, cardX + pad + 14, y + 10, { width: innerW * 0.55 });

  doc.fontSize(16).font(T.monoBold).fillColor(T.greenDark);
  doc.text(formatReceiptMoney(currencySymbol, paymentAmountToday), cardX + pad, y + 8, {
    width: innerW - 14,
    align: 'right'
  });
  y += paidBarH + 16;

  // Optional notes
  if (notes && String(notes).trim()) {
    doc.fontSize(8.5).font(T.sans).fillColor(T.muted);
    doc.text(`Note: ${String(notes).trim()}`, cardX + pad, y, { width: innerW });
    y += 14;
  }

  // ── 7. Footer ──────────────────────────────────────────────────────
  doc.fontSize(9).font(T.sans).fillColor(T.muted);
  doc.text('Thank you for your payment.', cardX + pad, y, { width: innerW, align: 'center' });
  y += 14;

  return y - cardY + pad;
}
