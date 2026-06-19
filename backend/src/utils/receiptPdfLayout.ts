import PDFDocument from 'pdfkit';
import { Invoice } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { CREST_LEDGER as T } from './invoicePdfTheme';
import { drawCrestLetterhead, drawCrestMetaBlock, formatCrestMoney } from './crestLedgerPdfLayout';

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

/** @deprecated Use decodeCrestLogoBuffer from crestLedgerPdfLayout */
export function decodeReceiptLogoBuffer(settings: Settings | null): Buffer | null {
  const raw = String(settings?.schoolLogo ?? '').trim();
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

/** Crest Ledger receipt body — same receipt data, invoice-matching appearance. */
export function renderModernReceiptBody(options: {
  doc: Doc;
  tableStartX: number;
  tableEndX: number;
  tableWidth: number;
  yStart: number;
  maxContentY: number;
  settings: Settings | null;
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
    tableStartX,
    tableEndX,
    tableWidth,
    yStart,
    maxContentY,
    settings,
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

  let yPos = drawCrestLetterhead(doc, settings, {
    tableStartX,
    tableEndX,
    yStart,
    documentSubtitle: 'PAYMENT RECEIPT',
    documentTitle: 'Receipt'
  });

  yPos = drawCrestMetaBlock(doc, {
    tableStartX,
    tableWidth,
    tableEndX,
    yStart: yPos,
    leftTitle: 'RECEIPT DETAILS',
    rightTitle: 'RECEIVED FROM',
    leftRows: [
      { label: 'Receipt Number', value: receiptNumber },
      { label: 'Invoice Number', value: invoiceNumber },
      { label: 'Payment Date', value: paymentDate.toLocaleDateString() },
      { label: 'Term', value: term || '—' }
    ],
    rightRows: [
      { label: 'Student Name', value: payerName },
      { label: 'Student No.', value: studentNumber || '—' },
      { label: 'Class', value: className || '—' }
    ]
  });

  const rowHeight = 17;
  const amountColumnWidth = 72;
  const qtyColumnWidth = 36;
  const rateColumnWidth = 72;
  const amountColumnStartX = tableEndX - amountColumnWidth;
  const rateColumnStartX = amountColumnStartX - rateColumnWidth;
  const qtyColumnStartX = rateColumnStartX - qtyColumnWidth;
  const descWidth = qtyColumnStartX - tableStartX - 8;

  doc.rect(tableStartX, yPos, tableWidth, rowHeight).fill(T.navy);
  doc.fontSize(7).font(T.sansBold).fillColor(T.white);
  doc.text('DESCRIPTION', tableStartX + 8, yPos + 5);
  doc.text('QTY', qtyColumnStartX, yPos + 5, { width: qtyColumnWidth, align: 'right' });
  doc.text('RATE', rateColumnStartX, yPos + 5, { width: rateColumnWidth, align: 'right' });
  doc.text('AMOUNT', amountColumnStartX, yPos + 5, { align: 'right', width: amountColumnWidth - 8 });
  yPos += rowHeight;

  let stripe = 0;
  lineItems.forEach((row) => {
    if (yPos + rowHeight > maxContentY - 120) {
      return;
    }
    const fill = stripe % 2 === 0 ? T.ivory : T.navyTint;
    doc.rect(tableStartX, yPos, tableWidth, rowHeight).fill(fill);
    doc.rect(tableStartX, yPos, tableWidth, rowHeight).lineWidth(0.25).strokeColor('#D8DCE8').stroke();
    doc.fontSize(7.5).font(T.sans).fillColor(T.slate);
    doc.text(row.description, tableStartX + 8, yPos + 5, { width: descWidth, ellipsis: true });
    doc.text(String(row.quantity), qtyColumnStartX, yPos + 5, { width: qtyColumnWidth, align: 'right' });
    doc.text(formatCrestMoney(currencySymbol, row.rate), rateColumnStartX, yPos + 5, {
      width: rateColumnWidth,
      align: 'right'
    });
    doc.text(formatCrestMoney(currencySymbol, row.amount), amountColumnStartX, yPos + 5, {
      align: 'right',
      width: amountColumnWidth - 8
    });
    yPos += rowHeight;
    stripe += 1;
  });

  yPos += 6;

  const summaryWidth = 210;
  const summaryX = tableEndX - summaryWidth;
  const summaryRowH = 16;

  const drawSummaryRow = (label: string, amount: number, bold = false, total = false) => {
    if (yPos + summaryRowH > maxContentY - 48) {
      return;
    }
    if (total) {
      doc.rect(summaryX, yPos, summaryWidth, summaryRowH + 2).fill(T.navy);
      doc.fontSize(8).font(T.sansBold).fillColor(T.white);
      doc.text(label, summaryX + 8, yPos + 5);
      doc.fillColor(T.gold);
      doc.text(formatCrestMoney(currencySymbol, amount), summaryX, yPos + 5, {
        align: 'right',
        width: summaryWidth - 10
      });
      yPos += summaryRowH + 4;
      return;
    }
    doc.rect(summaryX, yPos, summaryWidth, summaryRowH).fill(T.navyTint);
    doc.rect(summaryX, yPos, summaryWidth, summaryRowH).lineWidth(0.25).strokeColor('#D8DCE8').stroke();
    doc.fontSize(7.5).font(bold ? T.sansBold : T.sans).fillColor(T.slate);
    doc.text(label, summaryX + 8, yPos + 4);
    doc.text(formatCrestMoney(currencySymbol, amount), summaryX, yPos + 4, {
      align: 'right',
      width: summaryWidth - 10
    });
    yPos += summaryRowH;
  };

  drawSummaryRow('Total invoice amount', totals.totalInvoiceAmount);
  drawSummaryRow('Balance brought forward', totals.previousBalance);
  drawSummaryRow('Total paid to date', totals.totalPaid, true);
  drawSummaryRow('Balance carried forward', totals.remainingBalance, true);
  if (totals.prepaidAmount > 0) {
    drawSummaryRow('Prepaid amount', totals.prepaidAmount);
  }

  const methodLabel = paymentMethod || 'Payment';
  const todayLabel = isPrepayment ? 'Prepaid' : 'Today';
  drawSummaryRow(`${methodLabel} · ${todayLabel}`, paymentAmountToday, true, true);

  yPos += 6;

  if (yPos + 22 <= maxContentY - 28) {
    const sealR = 9;
    const sealCx = tableStartX + sealR + 2;
    const sealCy = yPos + sealR;
    doc.circle(sealCx, sealCy, sealR).fill(T.ivory);
    doc.circle(sealCx, sealCy, sealR).lineWidth(1.2).strokeColor(T.gold).stroke();
    doc.fontSize(11).font(T.sansBold).fillColor(T.gold);
    doc.text('✓', sealCx - 4.5, sealCy - 5.5);
    doc.fontSize(8).font(T.sansBold).fillColor(T.slate);
    doc.text('Thank you for your payment.', sealCx + sealR + 8, sealCy - 4);
    yPos += sealR * 2 + 6;
  }

  if (notes && String(notes).trim()) {
    doc.fontSize(7.5).font(T.sans).fillColor(T.slateMuted);
    doc.text(`Note: ${String(notes).trim()}`, tableStartX, yPos, { width: tableWidth });
    yPos += 14;
  }

  return yPos;
}
