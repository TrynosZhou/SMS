import PDFDocument from 'pdfkit';

export interface CashReceiptsPDFRow {
  paymentDate: string;
  receiptNumber: string;
  invoiceNumber: string;
  studentName: string;
  studentNumber: string;
  amountPaid: number;
}

export interface CashReceiptsPDFData {
  schoolName: string;
  currencySymbol: string;
  term: string;
  reportDate: Date;
  totalCashReceived: number;
  rows: CashReceiptsPDFRow[];
  schoolLogo2?: string | null;
}

export function createCashReceiptsPDF(data: CashReceiptsPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const { schoolName, currencySymbol, term, reportDate, totalCashReceived, rows, schoolLogo2 } = data;
      let yPos = 50;
      const logoSize = 70;

      const rawLogo = String(schoolLogo2 ?? '').trim();
      if (rawLogo.startsWith('data:image')) {
        try {
          const base64Data = rawLogo.split(',')[1];
          if (base64Data) {
            const imageBuffer = Buffer.from(base64Data, 'base64');
            doc.image(imageBuffer, 50, yPos, { width: logoSize, height: logoSize });
          }
        } catch (_) {}
      }
      yPos += logoSize + 10;

      doc.fontSize(18).font('Helvetica-Bold').fillColor('#333');
      doc.text('Cash Receipts Report', 50, yPos);
      yPos += 22;

      doc.fontSize(10).font('Helvetica').fillColor('#666');
      doc.text(schoolName, 50, yPos);
      yPos += 14;
      doc.text(`Term: ${term}`, 50, yPos);
      yPos += 14;
      doc.text(`Generated: ${reportDate.toLocaleDateString('en-US', { dateStyle: 'medium' })}`, 50, yPos);
      yPos += 20;

      doc.strokeColor('#ccc').lineWidth(1);
      doc.moveTo(50, yPos).lineTo(545, yPos).stroke();
      yPos += 16;

      if (!rows || rows.length === 0) {
        doc.fontSize(11).font('Helvetica').fillColor('#666');
        doc.text('No cash receipts for this term.', 50, yPos);
        yPos += 24;
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text(`Total Cash Received: ${currencySymbol} ${totalCashReceived.toFixed(2)}`, 50, yPos);
        doc.end();
        return;
      }

      const colDate = 50;
      const colReceipt = 112;
      const colInvoice = 212;
      const colStudent = 298;
      const colStudentNo = 400;
      const colAmount = 485;
      const rowHeight = 20;

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#333');
      doc.rect(colDate, yPos, 495, rowHeight).fillColor('#e0e7ff').fill().strokeColor('#c7d2fe').stroke();
      doc.fillColor('#333').text('Date', colDate + 4, yPos + 5, { width: 56 });
      doc.text('Receipt #', colReceipt + 4, yPos + 5, { width: 92 });
      doc.text('Invoice', colInvoice + 4, yPos + 5, { width: 78 });
      doc.text('Student', colStudent + 4, yPos + 5, { width: 94 });
      doc.text('Student #', colStudentNo + 4, yPos + 5, { width: 82 });
      doc.text('Amount', colAmount + 4, yPos + 5, { width: 58 });
      yPos += rowHeight;

      doc.fontSize(9).font('Helvetica').fillColor('#333');
      for (const row of rows) {
        const dateStr = row.paymentDate ? new Date(row.paymentDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
        const amountStr = `${currencySymbol} ${(row.amountPaid ?? 0).toFixed(2)}`;

        doc.rect(colDate, yPos, 495, rowHeight).strokeColor('#eee').stroke();
        doc.text(String(dateStr).slice(0, 14), colDate + 4, yPos + 5, { width: 56 });
        doc.text(String(row.receiptNumber || '—').slice(0, 24), colReceipt + 4, yPos + 5, { width: 92 });
        doc.text(String(row.invoiceNumber || '—').slice(0, 14), colInvoice + 4, yPos + 5, { width: 78 });
        doc.text(String(row.studentName || '—').slice(0, 20), colStudent + 4, yPos + 5, { width: 94 });
        doc.text(String(row.studentNumber || '—').slice(0, 12), colStudentNo + 4, yPos + 5, { width: 82 });
        doc.text(amountStr, colAmount + 4, yPos + 5, { width: 58 });
        yPos += rowHeight;

        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
        }
      }

      yPos += 10;
      doc.strokeColor('#333').lineWidth(1);
      doc.moveTo(colAmount, yPos).lineTo(545, yPos).stroke();
      yPos += 14;
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text(`Total Cash Received: ${currencySymbol} ${totalCashReceived.toFixed(2)}`, colAmount, yPos, { width: 60 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
