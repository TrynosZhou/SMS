import PDFDocument from 'pdfkit';
import { Invoice } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { CREST_LEDGER as T } from './invoicePdfTheme';
import {
  collectReceiptLineItems,
  computeReceiptTotals,
  renderModernReceiptBody
} from './receiptPdfLayout';
import {
  drawPaymentBankingDetailsPdf,
  getPaymentBankingBlockHeight
} from './paymentBankingPdfBlock';

interface ReceiptPDFData {
  invoice: Invoice;
  student: Student;
  settings: Settings | null;
  paymentAmount: number;
  paymentDate: Date;
  paymentMethod?: string;
  notes?: string;
  receiptNumber: string;
  isPrepayment?: boolean;
}

export function createReceiptPDF(data: ReceiptPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const MARGIN = 40;
      const doc = new PDFDocument({ margin: MARGIN, size: 'A4', autoFirstPage: true });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const { invoice, student, settings, paymentAmount, paymentDate, paymentMethod, notes, receiptNumber, isPrepayment } =
        data;
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

      doc.rect(0, 0, pageWidth, pageHeight).fill(T.ivory);

      const lineItems = collectReceiptLineItems(invoice, student, settings);
      const totals = computeReceiptTotals(invoice, student, settings);
      const paymentAmountToday = parseFloat(String(paymentAmount || 0));

      let yPos = renderModernReceiptBody({
        doc,
        tableStartX,
        tableEndX,
        tableWidth,
        yStart: MARGIN,
        maxContentY,
        settings,
        receiptNumber,
        invoiceNumber: invoice.invoiceNumber,
        paymentDate,
        term: invoice.term || '',
        payerName: `${student.firstName} ${student.lastName}`.trim(),
        studentNumber: student.studentNumber || '',
        className: student.classEntity?.name || '',
        currencySymbol,
        paymentMethod,
        paymentAmountToday,
        isPrepayment,
        notes,
        lineItems,
        totals
      });

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

/** @deprecated Use decodeReceiptLogoBuffer from receiptPdfLayout */
function decodeLogoBuffer(settings: Settings | null): Buffer | null {
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

export interface UniformReceiptChargeItem {
  itemName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface UniformReceiptPDFData {
  student: Student;
  settings: Settings | null;
  receiptNumber: string;
  paymentAmount: number;
  paymentDate: Date;
  paymentMethod: string;
  notes?: string | null;
  uniformBalanceAfter: number;
  chargeItems?: UniformReceiptChargeItem[];
}

/** Uniform items payment receipt PDF – structure similar to tuition receipt, labels match the Record payment page. */
export function createUniformReceiptPDF(data: UniformReceiptPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const { student, settings, receiptNumber, paymentAmount, paymentDate, paymentMethod, notes, uniformBalanceAfter, chargeItems = [] } = data;
      const currencySymbol = settings?.currencySymbol || '';

      let yPos = 50;
      const textStartX = 50;
      const logoSize = 80;

      // Logo: primary from settings, fallback to secondary
      const logoBuffer = decodeLogoBuffer(settings);
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, 50, yPos, { width: logoSize, height: logoSize });
        } catch (_) {}
      }
      yPos += logoBuffer ? logoSize + 12 : 0;
      if (settings?.schoolAddress) {
        doc.fontSize(10).font('Helvetica').text(String(settings.schoolAddress).trim(), textStartX, yPos);
        yPos += 14;
      }
      if (settings?.schoolPhone) {
        doc.fontSize(10).font('Helvetica').text(`Phone: ${settings.schoolPhone}`, textStartX, yPos);
        yPos += 14;
      }
      if (settings?.schoolEmail) {
        doc.fontSize(10).font('Helvetica').text(`Email: ${settings.schoolEmail}`, textStartX, yPos);
        yPos += 14;
      }
      yPos += 18;

      doc.strokeColor('#CCCCCC').lineWidth(1);
      doc.moveTo(50, yPos).lineTo(545, yPos).stroke();
      yPos += 15;

      doc.fontSize(20).font('Helvetica-Bold').fillColor('#28A745');
      doc.text('UNIFORM ITEMS PAYMENT RECEIPT', 50, yPos, { align: 'center', width: 500 });
      yPos += 28;

      const detailsBoxY = yPos;
      const detailsBoxHeight = 120;
      doc.rect(50, detailsBoxY, 500, detailsBoxHeight)
        .fillColor('#F8F9FA')
        .fill()
        .strokeColor('#28A745')
        .lineWidth(2)
        .stroke();

      const dividerX = 300;
      doc.strokeColor('#DEE2E6').lineWidth(0.5);
      doc.moveTo(dividerX, detailsBoxY + 5).lineTo(dividerX, detailsBoxY + detailsBoxHeight - 5).stroke();

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Receipt Number:', 60, detailsBoxY + 12);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(receiptNumber, 60, detailsBoxY + 27);

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Payment Date:', 60, detailsBoxY + 47);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(paymentDate.toLocaleDateString(), 60, detailsBoxY + 62);

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Student:', 60, detailsBoxY + 82);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      const studentDisplay = `${student.firstName || ''} ${student.lastName || ''} (${student.studentNumber || ''})`.trim();
      doc.text(studentDisplay, 60, detailsBoxY + 97);

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Payment Method:', 320, detailsBoxY + 12);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(paymentMethod, 320, detailsBoxY + 27);

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Amount Paid:', 320, detailsBoxY + 47);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#28A745');
      doc.text(`${currencySymbol} ${Number(paymentAmount).toFixed(2)}`, 320, detailsBoxY + 62);

      yPos = detailsBoxY + detailsBoxHeight + 18;

      doc.strokeColor('#CCCCCC').lineWidth(1);
      doc.moveTo(50, yPos).lineTo(545, yPos).stroke();
      yPos += 15;

      doc.fontSize(14).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Payment Details', 50, yPos);
      yPos += 24;

      const tableStartX = 50;
      const tableWidth = 495;
      const rowHeight = 26;
      const amountColWidth = 150;
      const amountColStart = 545 - amountColWidth;

      doc.rect(tableStartX, yPos, tableWidth, rowHeight)
        .fillColor('#E8F5E9')
        .fill()
        .strokeColor('#28A745')
        .lineWidth(1.5)
        .stroke();
      doc.strokeColor('#28A745').lineWidth(0.5);
      doc.moveTo(amountColStart, yPos + 2).lineTo(amountColStart, yPos + rowHeight - 2).stroke();
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000');
      doc.text('Amount Paid', tableStartX + 10, yPos + 8);
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#28A745');
      doc.text(`${currencySymbol} ${Number(paymentAmount).toFixed(2)}`, amountColStart, yPos + 8, { align: 'right', width: amountColWidth - 10 });
      yPos += rowHeight;

      doc.rect(tableStartX, yPos, tableWidth, rowHeight)
        .fillColor('#F8F9FA')
        .fill()
        .strokeColor('#CCCCCC')
        .lineWidth(0.5)
        .stroke();
      doc.strokeColor('#E0E0E0').lineWidth(0.5);
      doc.moveTo(amountColStart, yPos + 2).lineTo(amountColStart, yPos + rowHeight - 2).stroke();
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text('Payment Method', tableStartX + 10, yPos + 8);
      doc.text(paymentMethod, amountColStart, yPos + 8, { align: 'right', width: amountColWidth - 10 });
      yPos += rowHeight + 16;

      if (chargeItems.length > 0) {
        doc.strokeColor('#CCCCCC').lineWidth(1);
        doc.moveTo(50, yPos).lineTo(545, yPos).stroke();
        yPos += 15;
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#2C3E50');
        doc.text('Uniform items charged (paid from student account)', 50, yPos);
        yPos += 20;
        const colW = { item: 220, qty: 60, unit: 100, total: 115 };
        const tableW = 495;
        const rowH = 20;
        doc.rect(tableStartX, yPos, tableW, rowH).fillColor('#E8F5E9').fill().strokeColor('#28A745').lineWidth(1).stroke();
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b');
        doc.text('Item', tableStartX + 6, yPos + 6);
        doc.text('Qty', tableStartX + colW.item + 6, yPos + 6);
        doc.text('Unit price', tableStartX + colW.item + colW.qty + 6, yPos + 6);
        doc.text('Total', tableStartX + tableW - colW.total + 6, yPos + 6);
        yPos += rowH;
        doc.fontSize(10).font('Helvetica').fillColor('#000000');
        for (const row of chargeItems) {
          doc.rect(tableStartX, yPos, tableW, rowH).strokeColor('#E0E0E0').lineWidth(0.5).stroke();
          doc.text(String(row.itemName || '').slice(0, 35), tableStartX + 6, yPos + 6, { width: colW.item - 6 });
          doc.text(String(row.quantity ?? 0), tableStartX + colW.item + 6, yPos + 6);
          doc.text(`${currencySymbol} ${Number(row.unitPrice ?? 0).toFixed(2)}`, tableStartX + colW.item + colW.qty + 6, yPos + 6);
          doc.text(`${currencySymbol} ${Number(row.lineTotal ?? 0).toFixed(2)}`, tableStartX + tableW - colW.total + 6, yPos + 6);
          yPos += rowH;
        }
        yPos += 14;
      }

      doc.strokeColor('#CCCCCC').lineWidth(1);
      doc.moveTo(50, yPos).lineTo(545, yPos).stroke();
      yPos += 15;

      doc.fontSize(14).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Uniform Items Balance (after payment)', 50, yPos);
      yPos += 22;

      doc.rect(tableStartX, yPos, tableWidth, rowHeight)
        .fillColor('#FEF2F2')
        .fill()
        .strokeColor('#DC3545')
        .lineWidth(1)
        .stroke();
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Uniform Items Balance:', tableStartX + 10, yPos + 8);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#DC3545');
      doc.text(`${currencySymbol} ${Number(uniformBalanceAfter).toFixed(2)}`, amountColStart, yPos + 8, { align: 'right', width: amountColWidth - 10 });
      yPos += rowHeight + 18;

      if (notes && String(notes).trim()) {
        doc.rect(50, yPos, 500, 44)
          .fillColor('#F5F5F5')
          .fill()
          .strokeColor('#DEE2E6')
          .lineWidth(1)
          .stroke();
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
        doc.text('Notes:', 60, yPos + 10);
        doc.fontSize(9).font('Helvetica').fillColor('#000000');
        doc.text(String(notes).trim(), 60, yPos + 24, { width: 480 });
        yPos += 54;
      }

      doc.rect(50, yPos, 500, 36)
        .fillColor('#E8F5E9')
        .fill()
        .strokeColor('#28A745')
        .lineWidth(2)
        .stroke();
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#28A745');
      doc.text('Thank you for your payment!', 50, yPos + 12, { align: 'center', width: 500 });
      yPos += 44;

      const footerY = doc.page.height - 50;
      doc.strokeColor('#CCCCCC').lineWidth(0.5);
      doc.moveTo(50, footerY).lineTo(545, footerY).stroke();
      doc.fontSize(8).font('Helvetica').fillColor('#666666');
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 50, footerY + 10, { align: 'center', width: 500 });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

