import PDFDocument from 'pdfkit';
import { StudentLedgerReport } from './studentLedgerReport';

export interface StudentLedgerPDFData {
  schoolName: string;
  currencySymbol: string;
  report: StudentLedgerReport;
  generatedAt: Date;
  schoolLogo?: string | null;
}

export function createStudentLedgerPDF(data: StudentLedgerPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const { schoolName, currencySymbol, report, generatedAt, schoolLogo } = data;
      const sym = currencySymbol || '$';
      let y = 40;

      const rawLogo = String(schoolLogo ?? '').trim();
      if (rawLogo.startsWith('data:image')) {
        try {
          const base64Data = rawLogo.split(',')[1];
          if (base64Data) {
            doc.image(Buffer.from(base64Data, 'base64'), 40, y, { width: 56, height: 56 });
          }
        } catch {
          /* ignore */
        }
      }

      doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e293b');
      doc.text('Student Ledger Report', 110, y);
      y += 20;
      doc.fontSize(10).font('Helvetica').fillColor('#64748b');
      doc.text(schoolName, 110, y);
      y += 14;
      doc.text(`Generated: ${generatedAt.toLocaleDateString('en-GB', { dateStyle: 'medium' })}`, 110, y);
      y += 24;

      const st = report.student;
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a');
      doc.text(`${st.firstName} ${st.lastName}`, 40, y);
      y += 16;
      doc.fontSize(9).font('Helvetica').fillColor('#475569');
      doc.text(
        `Admission: ${st.admissionNumber}   |   Class: ${st.className || '—'}   |   Form: ${st.formName || '—'}`,
        40,
        y
      );
      y += 14;
      doc.text(`Term: ${report.term.name} (${report.term.startDate || '—'} to ${report.term.endDate || '—'})`, 40, y);
      y += 20;

      const cardW = 125;
      const cards = [
        { label: 'Opening', value: report.summary.openingBalance },
        { label: 'Total Debits', value: report.summary.totalDebits },
        { label: 'Total Credits', value: report.summary.totalCredits },
        { label: 'Closing', value: report.summary.closingBalance },
      ];
      cards.forEach((c, i) => {
        const x = 40 + i * (cardW + 8);
        doc.roundedRect(x, y, cardW, 42, 4).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.fillColor('#64748b').fontSize(8).font('Helvetica').text(c.label, x + 8, y + 8);
        doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text(`${sym}${c.value.toFixed(2)}`, x + 8, y + 22);
      });
      y += 56;

      const cols = { date: 40, type: 100, ref: 155, desc: 240, debit: 520, credit: 590, bal: 660 };
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
      doc.text('Date', cols.date, y);
      doc.text('Type', cols.type, y);
      doc.text('Reference', cols.ref, y);
      doc.text('Description', cols.desc, y);
      doc.text('Debit', cols.debit, y, { width: 60, align: 'right' });
      doc.text('Credit', cols.credit, y, { width: 60, align: 'right' });
      doc.text('Balance', cols.bal, y, { width: 70, align: 'right' });
      y += 14;
      doc.strokeColor('#cbd5e1').moveTo(40, y).lineTo(760, y).stroke();
      y += 6;

      doc.font('Helvetica').fontSize(8).fillColor('#1e293b');
      const rowH = 16;
      for (const line of report.lines) {
        if (y > 520) {
          doc.addPage({ margin: 40, size: 'A4', layout: 'landscape' });
          y = 40;
        }
        doc.text(line.date, cols.date, y);
        doc.text(line.type, cols.type, y);
        doc.text(line.reference, cols.ref, y, { width: 78, ellipsis: true });
        doc.text(line.description, cols.desc, y, { width: 270, ellipsis: true });
        doc.text(line.debit > 0 ? `${sym}${line.debit.toFixed(2)}` : '—', cols.debit, y, { width: 60, align: 'right' });
        doc.text(line.credit > 0 ? `${sym}${line.credit.toFixed(2)}` : '—', cols.credit, y, { width: 60, align: 'right' });
        doc.text(`${sym}${line.balance.toFixed(2)}`, cols.bal, y, { width: 70, align: 'right' });
        y += rowH;
      }

      if (report.lines.length === 0) {
        doc.text('No transactions for this term.', 40, y + 8);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
