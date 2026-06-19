import PDFDocument from 'pdfkit';
import { ExemptionReportRow } from './exemptionReport';

export interface ExemptionReportPDFData {
  schoolName: string;
  currencySymbol: string;
  reportDate: Date;
  rows: ExemptionReportRow[];
  schoolLogo?: string | null;
}

export function createExemptionReportPDF(data: ExemptionReportPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const { schoolName, currencySymbol, reportDate, rows, schoolLogo } = data;
      let yPos = 50;
      const logoSize = 70;

      const rawLogo = String(schoolLogo ?? '').trim();
      if (rawLogo.startsWith('data:image')) {
        try {
          const base64Data = rawLogo.split(',')[1];
          if (base64Data) {
            doc.image(Buffer.from(base64Data, 'base64'), 50, yPos, {
              width: logoSize,
              height: logoSize
            });
          }
        } catch (_) {}
      }
      yPos += logoSize + 10;

      doc.fontSize(18).font('Helvetica-Bold').fillColor('#333');
      doc.text('Exemption Report', 50, yPos);
      yPos += 22;

      doc.fontSize(10).font('Helvetica').fillColor('#666');
      doc.text(schoolName, 50, yPos);
      yPos += 14;
      doc.text(
        `Generated: ${reportDate.toLocaleDateString('en-US', { dateStyle: 'medium' })}`,
        50,
        yPos
      );
      yPos += 20;

      doc.strokeColor('#ccc').lineWidth(1);
      doc.moveTo(50, yPos).lineTo(545, yPos).stroke();
      yPos += 16;

      if (!rows.length) {
        doc.fontSize(11).fillColor('#666');
        doc.text('No students with exemptions.', 50, yPos);
        doc.end();
        return;
      }

      const cols = {
        id: 50,
        last: 115,
        first: 175,
        gender: 235,
        class: 285,
        amount: 470
      };
      const rowHeight = 18;

      const drawHeader = () => {
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#333');
        doc.text('Student ID', cols.id, yPos);
        doc.text('Last Name', cols.last, yPos);
        doc.text('First Name', cols.first, yPos);
        doc.text('Gender', cols.gender, yPos);
        doc.text('Class', cols.class, yPos);
        doc.text('Amount Exempted', cols.amount, yPos, { width: 75, align: 'right' });
        yPos += rowHeight;
        doc.strokeColor('#ddd').moveTo(50, yPos).lineTo(545, yPos).stroke();
        yPos += 6;
      };

      drawHeader();

      let totalExempted = 0;
      doc.font('Helvetica').fontSize(8).fillColor('#333');

      for (const r of rows) {
        if (yPos > 720) {
          doc.addPage();
          yPos = 50;
          drawHeader();
        }
        totalExempted += r.amountExempted;
        doc.text(String(r.studentNumber || '—'), cols.id, yPos, { width: 60 });
        doc.text(String(r.lastName || '—'), cols.last, yPos, { width: 55 });
        doc.text(String(r.firstName || '—'), cols.first, yPos, { width: 55 });
        doc.text(String(r.gender || '—'), cols.gender, yPos, { width: 45 });
        doc.text(String(r.className || '—'), cols.class, yPos, { width: 175 });
        doc.text(
          `${currencySymbol} ${r.amountExempted.toFixed(2)}`,
          cols.amount,
          yPos,
          { width: 75, align: 'right' }
        );
        yPos += rowHeight;
      }

      yPos += 8;
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text(
        `Total exempted: ${currencySymbol} ${totalExempted.toFixed(2)} (${rows.length} student(s))`,
        50,
        yPos
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
