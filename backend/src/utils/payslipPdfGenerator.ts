import PDFDocument from 'pdfkit';
import { PayrollEntry } from '../entities/PayrollEntry';
import { Teacher } from '../entities/Teacher';
import { AncillaryStaff } from '../entities/AncillaryStaff';
import { Settings } from '../entities/Settings';
import { parseAmount } from './numberUtils';

export interface PayslipPDFData {
  payrollEntry: PayrollEntry;
  teacher?: Teacher | null;
  ancillaryStaff?: AncillaryStaff | null;
  settings: Settings | null;
  month: number;
  year: number;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatNumber(n: number): string {
  return n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function createPayslipPDF(data: PayslipPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const { payrollEntry, teacher, ancillaryStaff, settings, month, year } = data;
      const currencySymbol = settings?.currencySymbol || 'KES';
      const schoolName = settings?.schoolName || 'School Management System';
      const generatedAt = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
      const slipRef = `PSL-${year}${String(month).padStart(2, '0')}-${(payrollEntry as any).id?.slice(0, 8) || 'N/A'}`;

      const employeeName = teacher
        ? `${teacher.firstName} ${teacher.lastName}`
        : ancillaryStaff
          ? `${ancillaryStaff.firstName} ${ancillaryStaff.lastName}`
          : 'Unknown';
      const employeeId = teacher?.teacherId || ancillaryStaff?.employeeId || 'N/A';
      const designation = ancillaryStaff?.designation || teacher ? 'Teacher' : 'N/A';
      const department = ancillaryStaff?.department || (teacher ? 'Teaching' : 'N/A');

      const pageWidth = 595;
      const pageHeight = 842;
      const margin = 40;
      const contentWidth = pageWidth - margin * 2;
      const headerHeight = 72;
      const borderInset = 8;
      const borderWidth = 5;

      // Solid blue border around document
      doc.rect(borderInset, borderInset, pageWidth - borderInset * 2, pageHeight - borderInset * 2)
        .strokeColor('#2563eb')
        .lineWidth(borderWidth)
        .stroke();

      // Light blue header - stretches to top of page
      doc.rect(0, 0, pageWidth, headerHeight)
        .fillColor('#f0f9ff')
        .fill()
        .strokeColor('#0284c7')
        .lineWidth(0.5)
        .stroke();

      // School logo (Logo 2) - inside header, top left
      const schoolLogo2 = (settings as any)?.schoolLogo2;
      const rawLogo = schoolLogo2 ? String(schoolLogo2).trim() : '';
      const logoSize = 50;
      if (rawLogo.startsWith('data:image')) {
        try {
          const base64Data = rawLogo.split(',')[1];
          if (base64Data) {
            const imageBuffer = Buffer.from(base64Data.replace(/\s/g, ''), 'base64');
            doc.image(imageBuffer, margin, 11, { width: logoSize, height: logoSize });
          }
        } catch (_) { /* ignore logo errors */ }
      }

      // School name and payslip title - centered in header
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#0369a1');
      doc.text(schoolName, margin, 18, { align: 'center', width: contentWidth });
      doc.fontSize(11).font('Helvetica').fillColor('#0c4a6e');
      doc.text('OFFICIAL PAYSLIP', margin, 44, { align: 'center', width: contentWidth });

      let yPos = headerHeight + 8;

      // Period & reference
      doc.fontSize(10).font('Helvetica').fillColor('#64748b');
      doc.text(`${MONTH_NAMES[month - 1]} ${year}`, margin, yPos);
      doc.text(`Ref: ${slipRef}`, margin + contentWidth - 140, yPos, { width: 130, align: 'right' });
      yPos += 22;

      // Employee card (modern rounded-corner style via rect)
      doc.rect(margin, yPos, contentWidth, 88)
        .fillColor('#ffffff')
        .fill()
        .strokeColor('#e2e8f0')
        .lineWidth(1.5)
        .stroke();

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b');
      doc.text('EMPLOYEE', margin + 16, yPos + 10);
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f172a');
      doc.text(employeeName, margin + 16, yPos + 24);
      doc.fontSize(9).font('Helvetica').fillColor('#475569');
      doc.text(`ID: ${employeeId}  |  ${designation}  |  ${department}`, margin + 16, yPos + 48);
      yPos += 100;

      // Salary breakdown section
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a');
      doc.text('Salary Breakdown', margin, yPos);
      yPos += 18;

      const tableStartX = margin;
      const tableWidth = contentWidth;
      const rowHeight = 24;
      const col1 = tableStartX + 12;
      const col2 = tableStartX + 280;
      const col3 = tableStartX + tableWidth - 100;

      // Table header
      doc.rect(tableStartX, yPos, tableWidth, rowHeight)
        .fillColor('#1e40af')
        .fill();
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#ffffff');
      doc.text('Component', col1, yPos + 8);
      doc.text('Type', col2, yPos + 8);
      doc.text('Amount', col3, yPos + 8, { align: 'right', width: 88 });
      yPos += rowHeight;

      const lines = (payrollEntry as any).lines || [];
      let rowIndex = 0;
      for (const line of lines) {
        const bg = rowIndex % 2 === 0 ? '#f8fafc' : '#ffffff';
        doc.rect(tableStartX, yPos, tableWidth, rowHeight).fillColor(bg).fill();
        doc.rect(tableStartX, yPos, tableWidth, rowHeight).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        doc.fontSize(10).font('Helvetica').fillColor('#334155');
        doc.text(line.componentName || '—', col1, yPos + 7);
        doc.text(String(line.componentType || '—').charAt(0).toUpperCase() + String(line.componentType || '').slice(1), col2, yPos + 7);
        doc.text(`${currencySymbol} ${formatNumber(parseAmount(line.amount))}`, col3, yPos + 7, { align: 'right', width: 88 });
        yPos += rowHeight;
        rowIndex++;
      }

      // Totals section - grid lines like salary breakdown table
      yPos += 12;
      const totalRowH = 22;
      const totalRows = [
        { label: 'Gross Salary', value: parseAmount(payrollEntry.grossSalary), bold: false },
        { label: 'Total Allowances', value: parseAmount(payrollEntry.totalAllowances), bold: false },
        { label: 'Total Deductions', value: parseAmount(payrollEntry.totalDeductions), bold: false },
        { label: 'Net Salary', value: parseAmount(payrollEntry.netSalary), bold: true }
      ];
      const colLabelW = tableWidth - 100;
      const colValW = 100;
      const colValX = tableStartX + colLabelW;
      for (let i = 0; i < totalRows.length; i++) {
        const r = totalRows[i];
        const cellY = yPos + i * totalRowH;
        const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
        doc.rect(tableStartX, cellY, colLabelW, totalRowH).fillColor(bg).fill().strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        doc.rect(colValX, cellY, colValW, totalRowH).fillColor(bg).fill().strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        if (r.bold) {
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a');
          doc.text(r.label, tableStartX + 10, cellY + 6);
          doc.fillColor('#059669');
          doc.text(`${currencySymbol} ${formatNumber(r.value)}`, colValX, cellY + 6, { align: 'right', width: colValW - 10 });
        } else {
          doc.fontSize(10).font('Helvetica').fillColor('#475569');
          doc.text(r.label, tableStartX + 10, cellY + 6);
          doc.fillColor('#334155');
          doc.text(`${currencySymbol} ${formatNumber(r.value)}`, colValX, cellY + 6, { align: 'right', width: colValW - 10 });
        }
      }
      yPos += totalRows.length * totalRowH;

      // Footer
      doc.fontSize(8).font('Helvetica').fillColor('#94a3b8');
      doc.text(`Generated on ${generatedAt} · ${schoolName}`, margin, pageHeight - 30, { align: 'center', width: contentWidth });
      doc.text('This is a system-generated document. No signature required.', margin, pageHeight - 18, { align: 'center', width: contentWidth });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
