import PDFDocument from 'pdfkit';
import { Invoice } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { parseAmount } from './numberUtils';
import { drawPaymentBankingDetailsPdf, getPaymentBankingBlockHeight } from './paymentBankingPdfBlock';
import { CREST_LEDGER as T } from './invoicePdfTheme';
import { drawCrestLetterhead, drawCrestMetaBlock } from './crestLedgerPdfLayout';

interface InvoicePDFData {
  invoice: Invoice;
  student: Student;
  settings: Settings | null;
  isFirstInvoice?: boolean;
}

interface TableRowSpec {
  label: string;
  amount: number;
  fill?: string;
  textColor?: string;
}

function parseFeePairsFromText(text: string): Array<{ label: string; amount: number }> {
  const pairs: Array<{ label: string; amount: number }> = [];
  const segment = text.includes(':') ? text.slice(text.indexOf(':') + 1) : text;
  const pattern = /([^:,]+):\s*([\d.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(segment)) !== null) {
    const label = match[1].trim();
    const amount = parseAmount(match[2]);
    if (label && amount > 0) {
      pairs.push({ label, amount });
    }
  }
  return pairs;
}

/** Line-item rows only — summary and status are rendered separately (same data sources). */
function collectLineItemRows(
  descriptionText: string,
  previousBalance: number,
  baseAmount: number,
  uniformTotal: number,
  invoiceTerm: string,
  prevTermLabel: string,
  remainingBalance: number
): TableRowSpec[] {
  const rows: TableRowSpec[] = [];
  const hasTuitionInBreakdown = (items: Array<{ label: string }>) =>
    items.some((item) => /tuition/i.test(item.label));

  let breakdownItems: Array<{ label: string; amount: number }> = [];
  const breakdownLine = descriptionText.split('\n').find((l) => l.startsWith('Breakdown'));
  if (breakdownLine) {
    breakdownItems = breakdownLine
      .replace('Breakdown →', '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.lastIndexOf(':');
        if (idx <= 0) return null;
        const label = part.substring(0, idx).trim();
        const amount = parseAmount(part.substring(idx + 1).trim());
        return amount > 0 ? { label, amount } : null;
      })
      .filter(Boolean) as Array<{ label: string; amount: number }>;
  } else if (/initial fees upon registration/i.test(descriptionText)) {
    breakdownItems = parseFeePairsFromText(descriptionText);
  }

  const adjustedLine = descriptionText
    .split('|')
    .map((s) => s.trim())
    .find((l) => l.startsWith('Adjusted fees'));
  if (adjustedLine) {
    const inner = adjustedLine.replace('Adjusted fees (', '').replace(')', '');
    inner.split(',').forEach((item) => {
      const idx = item.lastIndexOf(':');
      if (idx > 0) {
        const label = item.substring(0, idx).trim();
        const amount = parseAmount(item.substring(idx + 1).trim());
        if (amount > 0) {
          breakdownItems.push({ label, amount });
        }
      }
    });
  }

  let stripe = 0;
  breakdownItems.forEach((item) => {
    rows.push({
      label: item.label,
      amount: item.amount,
      fill: stripe % 2 === 0 ? T.ivory : T.navyTint
    });
    stripe += 1;
  });

  if (uniformTotal > 0) {
    rows.push({
      label: 'School Uniform Subtotal',
      amount: uniformTotal,
      fill: stripe % 2 === 0 ? T.ivory : T.navyTint,
      textColor: T.slate
    });
    stripe += 1;
  }

  rows.push({
    label: `Balance b/d (${prevTermLabel})`,
    amount: previousBalance,
    fill: stripe % 2 === 0 ? T.ivory : T.navyTint
  });
  stripe += 1;

  if (baseAmount > 0 && !hasTuitionInBreakdown(breakdownItems)) {
    rows.push({
      label: `Tuition ${invoiceTerm || ''}`.trim(),
      amount: baseAmount,
      fill: stripe % 2 === 0 ? T.ivory : T.navyTint
    });
    stripe += 1;
  }

  rows.push({
    label: 'Invoice balance c/f (Remaining)',
    amount: remainingBalance,
    fill: stripe % 2 === 0 ? T.ivory : T.navyTint
  });
  stripe += 1;

  const discountLine = descriptionText.split('\n').find((l) => l.toLowerCase().startsWith('discount applied'));
  if (discountLine) {
    const m = discountLine.match(/discount applied:\s*[A-Z]{0,3}\s*([0-9]+(\.[0-9]+)?)/i);
    if (m) {
      const amt = parseAmount(m[1]);
      if (amt > 0) {
        rows.push({
          label: 'Discount Applied',
          amount: amt,
          fill: stripe % 2 === 0 ? T.ivory : T.navyTint,
          textColor: T.slate
        });
        stripe += 1;
      }
    }
  }

  descriptionText
    .split('|')
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().startsWith('credit note') || line.toLowerCase().startsWith('debit note'))
    .forEach((line) => {
      const match = line.match(/([+-])\s*([0-9]+(\.[0-9]+)?)/);
      if (match) {
        const amountValue = parseFloat(match[2]);
        if (Number.isFinite(amountValue) && amountValue > 0) {
          const rowLabel = line.replace(/\s*\(([+-][0-9.]+\))\s*$/, '').trim() || line;
          rows.push({
            label: rowLabel,
            amount: Math.abs(amountValue),
            fill: stripe % 2 === 0 ? T.ivory : T.navyTint,
            textColor: T.slate
          });
          stripe += 1;
        }
      }
    });

  return rows;
}

function formatAccountStatus(statusText: string): string {
  if (statusText.toLowerCase() === 'paid') {
    return 'Paid in Full';
  }
  return statusText;
}

export function createInvoicePDF(data: InvoicePDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const MARGIN = 40;
      const doc = new PDFDocument({ margin: MARGIN, size: 'A4', autoFirstPage: true });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const { invoice, student, settings } = data;
      const currencySymbol = settings?.currencySymbol || '';
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const footerReserve = 14;
      const bankingCompact = true;
      const bankingBlockHeight = getPaymentBankingBlockHeight(settings, bankingCompact);
      const pageBottomLimit =
        bankingBlockHeight > 0
          ? pageHeight - MARGIN - footerReserve - bankingBlockHeight
          : pageHeight - MARGIN - footerReserve;
      const maxContentY = pageBottomLimit - 8;

      const tableStartX = MARGIN;
      const tableEndX = pageWidth - MARGIN;
      const tableWidth = tableEndX - tableStartX;
      const amountColumnWidth = 95;
      const amountColumnStartX = tableEndX - amountColumnWidth;
      const rowHeight = 17;
      const summaryWidth = 210;
      const summaryX = tableEndX - summaryWidth;

      // Ivory page background
      doc.rect(0, 0, pageWidth, pageHeight).fill(T.ivory);

      // ── Letterhead ───────────────────────────────────────────────────
      let yPos = drawCrestLetterhead(doc, settings, {
        tableStartX,
        tableEndX,
        yStart: MARGIN,
        documentSubtitle: 'STATEMENT OF ACCOUNT',
        documentTitle: 'Invoice'
      });

      // ── Meta block (Invoice Details / Billed To) ───────────────────
      yPos = drawCrestMetaBlock(doc, {
        tableStartX,
        tableWidth,
        tableEndX,
        yStart: yPos,
        leftTitle: 'INVOICE DETAILS',
        rightTitle: 'BILLED TO',
        leftRows: [
          { label: 'Invoice Number', value: invoice.invoiceNumber },
          { label: 'Invoice Date', value: new Date(invoice.createdAt).toLocaleDateString() },
          { label: 'Due Date', value: new Date(invoice.dueDate).toLocaleDateString() },
          { label: 'Term', value: invoice.term || '—' }
        ],
        rightRows: [
          { label: 'Student Name', value: `${student.firstName} ${student.lastName}` },
          { label: 'Student No.', value: student.studentNumber || '—' },
          { label: 'Class', value: student.classEntity?.name || '—' }
        ]
      });

      // ── Amount calculations (unchanged logic) ───────────────────────
      const invoiceAmount = parseAmount(invoice.amount);
      let previousBalance = parseAmount(invoice.previousBalance);
      const paidAmount = parseAmount(invoice.paidAmount);
      const balance = parseAmount(invoice.balance);
      const prepaidAmount = parseAmount(invoice.prepaidAmount);
      const uniformTotal = parseAmount((invoice as any).uniformTotal);
      const baseAmount = parseFloat((invoiceAmount - uniformTotal).toFixed(2));

      const tryNum = (v: any) => (isFinite(Number(v)) ? Number(v) : 0);
      const normalizedStatus = String((student as any).studentStatus || '').trim().toLowerCase();
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
      const remainingBalance = Math.max(0, totalInvoiceAmount - paidAmount - prepaidAmount);
      const appliedPrepaidAmount = Math.min(prepaidAmount, totalInvoiceAmount);
      const finalTotal = totalInvoiceAmount - appliedPrepaidAmount;

      const prevTermLabel = (() => {
        const t = String(invoice.term || '').toLowerCase();
        if (t.includes('term 2')) return 'Term 1';
        if (t.includes('term 3')) return 'Term 2';
        if (t.includes('term 1')) return 'Previous Term';
        return 'Previous Term';
      })();

      const statusRaw = (invoice.status as any) || 'pending';
      const statusText = String(statusRaw).charAt(0).toUpperCase() + String(statusRaw).slice(1);

      const lineItems = collectLineItemRows(
        String(invoice.description || ''),
        previousBalance,
        baseAmount,
        uniformTotal,
        invoice.term || '',
        prevTermLabel,
        remainingBalance
      );

      // ── Line-items table ────────────────────────────────────────────
      doc.rect(tableStartX, yPos, tableWidth, rowHeight).fill(T.navy);
      doc.fontSize(7).font(T.sansBold).fillColor(T.white);
      doc.text('DESCRIPTION', tableStartX + 8, yPos + 5);
      doc.text('AMOUNT', amountColumnStartX, yPos + 5, { align: 'right', width: amountColumnWidth - 8 });
      yPos += rowHeight;

      const renderLineRow = (spec: TableRowSpec) => {
        if (yPos + rowHeight > maxContentY - 70) {
          return;
        }
        doc.rect(tableStartX, yPos, tableWidth, rowHeight).fill(spec.fill || T.ivory);
        doc.rect(tableStartX, yPos, tableWidth, rowHeight).lineWidth(0.25).strokeColor('#D8DCE8').stroke();
        doc.fontSize(7.5).font(T.sans).fillColor(spec.textColor || T.slate);
        doc.text(spec.label, tableStartX + 8, yPos + 5, {
          width: amountColumnStartX - tableStartX - 16,
          ellipsis: true
        });
        doc.text(`${currencySymbol} ${spec.amount.toFixed(2)}`, amountColumnStartX, yPos + 5, {
          align: 'right',
          width: amountColumnWidth - 8
        });
        yPos += rowHeight;
      };

      lineItems.forEach(renderLineRow);
      yPos += 6;

      // ── Summary block (right-aligned) ───────────────────────────────
      const summaryRowH = 16;
      const summaryRows: Array<{ label: string; amount: number; total?: boolean }> = [];
      if (paidAmount > 0) {
        summaryRows.push({ label: 'Amount Paid', amount: paidAmount });
      }
      if (prepaidAmount > 0) {
        summaryRows.push({ label: 'Prepaid Amount', amount: prepaidAmount });
      }
      if (paidAmount > 0 || prepaidAmount > 0) {
        summaryRows.push({ label: 'Remaining Balance', amount: balance });
      }
      summaryRows.push({ label: 'Total Amount Due', amount: finalTotal, total: true });

      summaryRows.forEach((row) => {
        if (yPos + summaryRowH > maxContentY - 36) {
          return;
        }
        if (row.total) {
          doc.rect(summaryX, yPos, summaryWidth, summaryRowH + 2).fill(T.navy);
          doc.fontSize(8).font(T.sansBold).fillColor(T.white);
          doc.text(row.label, summaryX + 8, yPos + 5);
          doc.fillColor(T.gold);
          doc.text(`${currencySymbol} ${row.amount.toFixed(2)}`, summaryX, yPos + 5, {
            align: 'right',
            width: summaryWidth - 10
          });
        } else {
          doc.rect(summaryX, yPos, summaryWidth, summaryRowH).fill(T.navyTint);
          doc.rect(summaryX, yPos, summaryWidth, summaryRowH).lineWidth(0.25).strokeColor('#D8DCE8').stroke();
          doc.fontSize(7.5).font(T.sans).fillColor(T.slate);
          doc.text(row.label, summaryX + 8, yPos + 4);
          doc.text(`${currencySymbol} ${row.amount.toFixed(2)}`, summaryX, yPos + 4, {
            align: 'right',
            width: summaryWidth - 10
          });
        }
        yPos += row.total ? summaryRowH + 4 : summaryRowH;
      });

      yPos += 6;

      // ── Account status seal ─────────────────────────────────────────
      if (yPos + 22 <= maxContentY - 28) {
        const sealR = 9;
        const sealCx = tableStartX + sealR + 2;
        const sealCy = yPos + sealR;
        doc.circle(sealCx, sealCy, sealR).fill(T.ivory);
        doc.circle(sealCx, sealCy, sealR).lineWidth(1.2).strokeColor(T.gold).stroke();
        doc.fontSize(11).font(T.sansBold).fillColor(T.gold);
        doc.text('✓', sealCx - 4.5, sealCy - 5.5);
        doc.fontSize(8).font(T.sansBold).fillColor(T.slate);
        doc.text(
          `Account Status: ${formatAccountStatus(statusText)}`,
          sealCx + sealR + 8,
          sealCy - 4
        );
        yPos += sealR * 2 + 6;
      }

      // ── Banking block — follows content with a tight gap (not fixed page bottom) ──
      if (bankingBlockHeight > 0) {
        const gapBeforeBanking = 12;
        const bankingY = Math.min(yPos + gapBeforeBanking, pageBottomLimit);

        drawPaymentBankingDetailsPdf(doc, settings, bankingY, {
          fixedPosition: true,
          pageIndex: 0,
          compact: true,
          crestLedger: true,
          boxX: tableStartX,
          boxW: tableWidth
        });

        const firstPage = doc.bufferedPageRange().start;
        doc.switchToPage(firstPage);
        const footerY = bankingY + bankingBlockHeight + 4;
        doc.fontSize(6.5).font(T.sans).fillColor(T.slateMuted);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, tableStartX, footerY, {
          align: 'center',
          width: tableWidth
        });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
