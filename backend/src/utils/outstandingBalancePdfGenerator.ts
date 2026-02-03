import PDFDocument from 'pdfkit';

export interface OutstandingBalanceRow {
  studentNumber?: string;
  firstName?: string;
  lastName?: string;
  invoiceBalance: number;
}

export interface OutstandingBalancePDFData {
  schoolName: string;
  currencySymbol: string;
  reportDate: Date;
  balances: OutstandingBalanceRow[];
}

export function createOutstandingBalancePDF(
  data: OutstandingBalancePDFData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      const { schoolName, currencySymbol, reportDate, balances } = data;
      let yPos = 50;

      doc.fontSize(18).font('Helvetica-Bold').fillColor('#333');
      doc.text('Outstanding Balances Report', 50, yPos);
      yPos += 22;

      doc.fontSize(10).font('Helvetica').fillColor('#666');
      doc.text(schoolName, 50, yPos);
      yPos += 14;
      doc.text(`Generated: ${reportDate.toLocaleDateString('en-US', { dateStyle: 'medium' })}`, 50, yPos);
      yPos += 20;

      doc.strokeColor('#ccc').lineWidth(1);
      doc.moveTo(50, yPos).lineTo(545, yPos).stroke();
      yPos += 16;

      if (!balances || balances.length === 0) {
        doc.fontSize(11).font('Helvetica').fillColor('#666');
        doc.text('No outstanding balances.', 50, yPos);
        doc.end();
        return;
      }

      const colStudentId = 50;
      const colName = 140;
      const colBalance = 420;
      const rowHeight = 20;

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#333');
      doc.rect(colStudentId, yPos, 490, rowHeight).fillColor('#f0f0f0').fill().strokeColor('#ddd').stroke();
      doc.fillColor('#333').text('Student ID', colStudentId + 6, yPos + 5, { width: 85 });
      doc.text('Student Name', colName + 6, yPos + 5, { width: 270 });
      doc.text('Balance', colBalance + 6, yPos + 5, { width: 70 });
      yPos += rowHeight;

      doc.fontSize(9).font('Helvetica').fillColor('#333');
      let total = 0;
      for (const row of balances) {
        const balance = Number(row.invoiceBalance) || 0;
        total += balance;
        const name = [row.firstName, row.lastName].filter(Boolean).join(' ') || '—';
        const studentId = row.studentNumber || (row as any).studentId || '—';
        const balanceStr = `${currencySymbol} ${balance.toFixed(2)}`;

        doc.rect(colStudentId, yPos, 490, rowHeight).strokeColor('#eee').stroke();
        doc.text(String(studentId).slice(0, 20), colStudentId + 6, yPos + 5, { width: 85 });
        doc.text(name.slice(0, 45), colName + 6, yPos + 5, { width: 270 });
        doc.text(balanceStr, colBalance + 6, yPos + 5, { width: 70 });
        yPos += rowHeight;

        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
        }
      }

      yPos += 10;
      doc.strokeColor('#333').lineWidth(1);
      doc.moveTo(colBalance, yPos).lineTo(540, yPos).stroke();
      yPos += 14;
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text(`Total Outstanding: ${currencySymbol} ${total.toFixed(2)}`, colBalance, yPos, { width: 120 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
