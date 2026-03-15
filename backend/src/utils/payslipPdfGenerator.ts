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
      const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });
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
      const nationalId = (teacher as any)?.nationalId || (ancillaryStaff as any)?.nationalId || '';
      const designation = ancillaryStaff?.designation || teacher ? 'Teacher' : 'N/A';
      const department = ancillaryStaff?.department || (teacher ? 'Teaching' : 'N/A');
      const paymentMethod = (payrollEntry as any).paymentMethod || (teacher as any)?.paymentMethod || (ancillaryStaff as any)?.paymentMethod || 'cash';
      const bankName = (payrollEntry as any).bankName || (teacher as any)?.bankName || (ancillaryStaff as any)?.bankName || '';
      const bankAccountNumber = (teacher as any)?.bankAccountNumber || (ancillaryStaff as any)?.bankAccountNumber || '';
      const showBankDetails = (paymentMethod === 'bank' || paymentMethod === 'both') && (!!bankName || !!bankAccountNumber);

      const pageWidth = 595;
      const pageHeight = 842;
      const margin = 36;
      const contentWidth = pageWidth - margin * 2;
      const headerHeight = 52;
      const borderWidth = 4;

      // Solid blue border around the whole payslip (edge to edge)
      doc.rect(0, 0, pageWidth, pageHeight)
        .strokeColor('#2563eb')
        .lineWidth(borderWidth)
        .stroke();

      // Light blue header
      doc.rect(0, 0, pageWidth, headerHeight)
        .fillColor('#f0f9ff')
        .fill()
        .strokeColor('#0284c7')
        .lineWidth(0.5)
        .stroke();

      // School logo (Logo 2)
      const schoolLogo2 = (settings as any)?.schoolLogo2;
      const rawLogo = schoolLogo2 ? String(schoolLogo2).trim() : '';
      const logoSize = 40;
      if (rawLogo.startsWith('data:image')) {
        try {
          const base64Data = rawLogo.split(',')[1];
          if (base64Data) {
            const imageBuffer = Buffer.from(base64Data.replace(/\s/g, ''), 'base64');
            doc.image(imageBuffer, margin, 8, { width: logoSize, height: logoSize });
          }
        } catch (_) { /* ignore logo errors */ }
      }

      doc.fontSize(16).font('Helvetica-Bold').fillColor('#0369a1');
      doc.text(schoolName, margin, 12, { align: 'center', width: contentWidth });
      doc.fontSize(9).font('Helvetica').fillColor('#0c4a6e');
      doc.text('OFFICIAL PAYSLIP', margin, 34, { align: 'center', width: contentWidth });

      let yPos = headerHeight + 4;

      // Period & reference (ensure Ref is visible and not cut off)
      doc.fontSize(9).font('Helvetica').fillColor('#64748b');
      doc.text(`${MONTH_NAMES[month - 1]} ${year}`, margin, yPos);
      doc.fontSize(9).font('Helvetica').fillColor('#475569');
      doc.text(`Ref: ${slipRef}`, margin, yPos, { width: contentWidth - 20, align: 'right' });
      yPos += 14;

      // Employee card - dynamic height for National ID and bank/account when deposited
      const textLeft = margin + 8;
      const hasNationalId = !!nationalId && String(nationalId).trim().length > 0;
      const empCardH = 56 + (hasNationalId ? 14 : 0) + (showBankDetails ? 28 : 0);
      doc.rect(margin, yPos, contentWidth, empCardH)
        .fillColor('#ffffff')
        .fill()
        .strokeColor('#e2e8f0')
        .lineWidth(1)
        .stroke();

      doc.fontSize(12).font('Helvetica-Bold').fillColor('#64748b');
      doc.text('EMPLOYEE', textLeft, yPos + 6);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a');
      doc.text(employeeName, textLeft, yPos + 20);
      let lineY = yPos + 38;
      if (hasNationalId) {
        doc.fontSize(11).font('Helvetica').fillColor('#475569');
        doc.text(`National ID: ${String(nationalId).trim()}`, textLeft, yPos + 34);
        lineY = yPos + 50;
      }
      doc.fontSize(12).font('Helvetica').fillColor('#475569');
      doc.text(`Employee ID: ${employeeId}  |  ${designation}  |  ${department}`, textLeft, lineY);
      if (showBankDetails) {
        const bankY = lineY + 16;
        if (bankName) {
          doc.fontSize(11).font('Helvetica').fillColor('#475569');
          doc.text(`Bank: ${bankName}`, textLeft, bankY);
        }
        if (bankAccountNumber) {
          doc.fontSize(11).font('Helvetica').fillColor('#475569');
          doc.text(`Account: ${bankAccountNumber}`, textLeft, bankY + (bankName ? 14 : 0));
        }
      }
      yPos += empCardH + 6;

      // Salary breakdown (compact) - same left align as employee (textLeft)
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a');
      doc.text('Salary Breakdown', textLeft, yPos);
      yPos += 12;

      const tableStartX = margin;
      const tableWidth = contentWidth;
      const rowHeight = 18;
      const headerTwoRows = 36;
      const col1 = textLeft;
      const col2 = tableStartX + 260;
      const col3 = tableStartX + tableWidth - 90;
      doc.rect(tableStartX, yPos, tableWidth, headerTwoRows)
        .fillColor('#1e40af')
        .fill();
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#ffffff');
      doc.text('Component', col1, yPos + 4);
      doc.text('Type', col2, yPos + 4);
      doc.text('Amount', col3, yPos + 4, { align: 'right', width: 80 });
      doc.fontSize(11).font('Helvetica').fillColor('#93c5fd');
      doc.text(currencySymbol, col3, yPos + 22, { align: 'right', width: 80 });
      yPos += headerTwoRows;

      const lines = (payrollEntry as any).lines || [];
      const maxTableRows = Math.min(lines.length, 15);
      let rowIndex = 0;
      for (let i = 0; i < maxTableRows; i++) {
        const line = lines[i];
        const bg = rowIndex % 2 === 0 ? '#f8fafc' : '#ffffff';
        doc.rect(tableStartX, yPos, tableWidth, rowHeight).fillColor(bg).fill();
        doc.rect(tableStartX, yPos, tableWidth, rowHeight).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        doc.fontSize(12).font('Helvetica').fillColor('#334155');
        doc.text((line.componentName || '—').slice(0, 40), col1, yPos + 3);
        doc.text(String(line.componentType || '—').charAt(0).toUpperCase() + String(line.componentType || '').slice(1), col2, yPos + 3);
        doc.text(formatNumber(parseAmount(line.amount)), col3, yPos + 3, { align: 'right', width: 80 });
        yPos += rowHeight;
        rowIndex++;
      }
      if (lines.length > maxTableRows) {
        doc.fontSize(12).fillColor('#64748b');
        doc.text(`... and ${lines.length - maxTableRows} more component(s)`, col1, yPos + 3);
        yPos += rowHeight;
      }

      // Totals (compact)
      yPos += 6;
      const totalRowH = 16;
      const totalRows = [
        { label: 'Gross Salary', value: parseAmount(payrollEntry.grossSalary), bold: false },
        { label: 'Total Allowances', value: parseAmount(payrollEntry.totalAllowances), bold: false },
        { label: 'Total Deductions', value: parseAmount(payrollEntry.totalDeductions), bold: false },
        { label: 'Net Salary', value: parseAmount(payrollEntry.netSalary), bold: true }
      ];
      const colLabelW = tableWidth - 90;
      const colValW = 90;
      const colValX = tableStartX + colLabelW;
      for (let i = 0; i < totalRows.length; i++) {
        const r = totalRows[i];
        const cellY = yPos + i * totalRowH;
        const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
        doc.rect(tableStartX, cellY, colLabelW, totalRowH).fillColor(bg).fill().strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        doc.rect(colValX, cellY, colValW, totalRowH).fillColor(bg).fill().strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        if (r.bold) {
          doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a');
          doc.text(r.label, col1, cellY + 3);
          doc.fillColor('#059669');
          doc.text(formatNumber(r.value), colValX, cellY + 3, { align: 'right', width: colValW - 8 });
        } else {
          doc.fontSize(12).font('Helvetica').fillColor('#475569');
          doc.text(r.label, col1, cellY + 3);
          doc.fillColor('#334155');
          doc.text(formatNumber(r.value), colValX, cellY + 3, { align: 'right', width: colValW - 8 });
        }
      }
      yPos += totalRows.length * totalRowH;

      // Footer on first page only: switch back to page 0 so footer is on page 1 (no blank pages)
      if (typeof doc.switchToPage === 'function') {
        doc.switchToPage(0);
      }
      doc.fontSize(12).font('Helvetica').fillColor('#94a3b8');
      doc.text(`Generated on ${generatedAt} · ${schoolName}`, margin, pageHeight - 28, { align: 'center', width: contentWidth });
      doc.text('This is a system-generated document. No signature required.', margin, pageHeight - 14, { align: 'center', width: contentWidth });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
