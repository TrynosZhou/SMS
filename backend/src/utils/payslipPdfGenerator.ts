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
      const gridColor = '#9ca3af';
      doc.rect(margin, yPos, contentWidth, empCardH)
        .fillColor('#ffffff')
        .fill()
        .strokeColor(gridColor)
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

      const rawLines = (payrollEntry as any).lines;
      const lines = Array.isArray(rawLines) ? rawLines : [];
      const typeOf = (l: any) => String(l?.componentType || '').toLowerCase();
      const earningsLines = lines.filter((l: any) => {
        const t = typeOf(l);
        return t === 'basic' || t === 'allowance';
      });
      const deductionLines = lines.filter((l: any) => typeOf(l) === 'deduction');
      const totalEarnings = earningsLines.reduce((s: number, l: any) => s + parseAmount(l.amount), 0);
      const totalDeductions = deductionLines.reduce((s: number, l: any) => s + parseAmount(l.amount), 0);
      const tableStartX = margin;
      const tableWidth = contentWidth;
      const rowHeight = 16;
      const col1 = textLeft;
      const colLabelW = tableWidth - 90;
      const colValW = 90;
      const colValX = tableStartX + colLabelW;

      const drawSection = (heading: string, items: { label: string; amount: number }[], bgHeader: string) => {
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a');
        doc.text(heading, textLeft, yPos);
        yPos += 10;
        doc.rect(tableStartX, yPos, tableWidth, rowHeight).fillColor(bgHeader).fill();
        doc.rect(tableStartX, yPos, tableWidth, rowHeight).strokeColor(gridColor).lineWidth(0.5).stroke();
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#334155');
        doc.text('Item', col1, yPos + 3);
        doc.text('Amount', colValX, yPos + 3, { align: 'right', width: colValW - 6 });
        yPos += rowHeight;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
          doc.rect(tableStartX, yPos, tableWidth, rowHeight).fillColor(bg).fill();
          doc.rect(tableStartX, yPos, tableWidth, rowHeight).strokeColor(gridColor).lineWidth(0.5).stroke();
          doc.fontSize(10).font('Helvetica').fillColor('#334155');
          doc.text(item.label.slice(0, 45), col1, yPos + 3);
          doc.text(formatNumber(item.amount), colValX, yPos + 3, { align: 'right', width: colValW - 6 });
          yPos += rowHeight;
        }
        yPos += 4;
      };

      // --- EARNINGS ---
      const earningsItems: { label: string; amount: number }[] = [];
      const basicLines = earningsLines.filter((l: any) => typeOf(l) === 'basic');
      const allowanceLines = earningsLines.filter((l: any) => typeOf(l) === 'allowance');
      basicLines.forEach((l: any) => {
        earningsItems.push({ label: (l.componentName && l.componentName.trim()) ? l.componentName : 'Basic salary', amount: parseAmount(l.amount) });
      });
      allowanceLines.forEach((l: any) => {
        const name = (l.componentName || '').trim() || 'Allowance';
        earningsItems.push({ label: name, amount: parseAmount(l.amount) });
      });
      if (earningsItems.length === 0) {
        earningsItems.push({ label: 'Basic salary', amount: parseAmount(payrollEntry.grossSalary) });
      }
      drawSection('EARNINGS', earningsItems, '#e0f2fe');
      doc.rect(tableStartX, yPos, colLabelW, rowHeight).fillColor('#f0fdf4').fill().strokeColor(gridColor).lineWidth(0.5).stroke();
      doc.rect(colValX, yPos, colValW, rowHeight).fillColor('#f0fdf4').fill().strokeColor(gridColor).lineWidth(0.5).stroke();
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a');
      doc.text('Total Earnings', col1, yPos + 3);
      doc.text(formatNumber(totalEarnings), colValX, yPos + 3, { align: 'right', width: colValW - 6 });
      yPos += rowHeight + 8;

      // --- DEDUCTIONS ---
      const deductionItems: { label: string; amount: number }[] = [];
      deductionLines.forEach((l: any) => {
        const name = String(l.componentName || '').trim();
        const isLoan = /loan|repayment|salary advance/i.test(name);
        deductionItems.push({
          label: name ? (isLoan ? 'Loan deduction' : name) : 'Deduction',
          amount: parseAmount(l.amount)
        });
      });
      if (deductionItems.length === 0) {
        deductionItems.push({ label: 'No deductions', amount: 0 });
      }
      drawSection('DEDUCTIONS', deductionItems, '#fee2e2');
      doc.rect(tableStartX, yPos, colLabelW, rowHeight).fillColor('#fef2f2').fill().strokeColor(gridColor).lineWidth(0.5).stroke();
      doc.rect(colValX, yPos, colValW, rowHeight).fillColor('#fef2f2').fill().strokeColor(gridColor).lineWidth(0.5).stroke();
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a');
      doc.text('Total Deductions', col1, yPos + 3);
      doc.text(formatNumber(totalDeductions), colValX, yPos + 3, { align: 'right', width: colValW - 6 });
      yPos += rowHeight + 8;

      // Net Salary
      const totalRowH = 18;
      doc.rect(tableStartX, yPos, colLabelW, totalRowH).fillColor('#ecfdf5').fill().strokeColor(gridColor).lineWidth(1).stroke();
      doc.rect(colValX, yPos, colValW, totalRowH).fillColor('#ecfdf5').fill().strokeColor(gridColor).lineWidth(1).stroke();
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#065f46');
      doc.text('Net Salary', col1, yPos + 5);
      doc.text(formatNumber(parseAmount(payrollEntry.netSalary)), colValX, yPos + 5, { align: 'right', width: colValW - 8 });
      yPos += totalRowH;

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
