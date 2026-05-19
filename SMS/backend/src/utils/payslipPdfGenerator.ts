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

/** Count working days in the given month (1–12) and year. Employees work Mon–Sat; Sundays are off. */
function getWorkingDaysInMonth(year: number, month: number): number {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  let count = 0;
  const d = new Date(first);
  while (d <= last) {
    if (d.getDay() !== 0) count++; // exclude Sunday only (0 = Sunday)
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/** Simple number to words for amounts (e.g. 9500 -> "Nine Thousand Five Hundred"). */
function numberToWords(n: number): string {
  const whole = Math.round(Math.abs(n));
  if (whole === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function upTo99(x: number): string {
    if (x < 10) return ones[x];
    if (x < 20) return teens[x - 10];
    const t = Math.floor(x / 10);
    const o = x % 10;
    return tens[t] + (o > 0 ? ' ' + ones[o] : '');
  }
  function upTo999(x: number): string {
    if (x < 100) return upTo99(x);
    const h = Math.floor(x / 100);
    const r = x % 100;
    return ones[h] + ' Hundred' + (r > 0 ? ' ' + upTo99(r) : '');
  }
  if (whole < 1000) return upTo999(whole);
  if (whole < 1000000) {
    const th = Math.floor(whole / 1000);
    const r = whole % 1000;
    return upTo999(th) + ' Thousand' + (r > 0 ? ' ' + upTo999(r) : '');
  }
  const m = Math.floor(whole / 1000000);
  const r = whole % 1000000;
  return upTo999(m) + ' Million' + (r > 0 ? ' ' + (r >= 1000 ? numberToWords(r) : upTo999(r)) : '');
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
      const schoolName = settings?.schoolName || 'School';
      const schoolAddress = (settings as any)?.schoolAddress || '';
      const generatedAt = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
      const slipRef = `PSL-${year}${String(month).padStart(2, '0')}-${(payrollEntry as any).id?.slice(0, 8) || 'N/A'}`;

      const employeeName = teacher
        ? `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim()
        : ancillaryStaff
          ? `${ancillaryStaff.firstName || ''} ${ancillaryStaff.lastName || ''}`.trim()
          : 'Unknown';
      const employeeId = teacher?.teacherId || ancillaryStaff?.employeeId || 'N/A';
      const nationalId = (teacher as any)?.nationalId || (ancillaryStaff as any)?.nationalId || '';
      const designation = ancillaryStaff?.designation || (teacher ? 'Teacher' : 'N/A');
      const department = ancillaryStaff?.department || (teacher ? 'Teaching' : 'N/A');

      const teacherDateJoined = (teacher as any)?.dateJoined;
      const ancillaryDateJoined = (ancillaryStaff as any)?.dateJoined;
      const dateOfJoining = teacherDateJoined || ancillaryDateJoined
        ? new Date(teacherDateJoined || ancillaryDateJoined).toISOString().slice(0, 10)
        : '—';
      const payPeriod = `${MONTH_NAMES[month - 1]} ${year}`;
      const workedDays = String(getWorkingDaysInMonth(year, month));

      const pageWidth = 595;
      const pageHeight = 842;
      const margin = 40;
      const contentWidth = pageWidth - margin * 2;

      // Border
      doc.rect(0, 0, pageWidth, pageHeight)
        .strokeColor('#000000')
        .lineWidth(0.5)
        .stroke();

      // School logo (Logo 2) from settings – top left of header
      const schoolLogo2 = (settings as any)?.schoolLogo2;
      const rawLogo = schoolLogo2 ? String(schoolLogo2).trim() : '';
      const logoSize = 44;
      const logoY = 14;
      if (rawLogo.startsWith('data:image')) {
        try {
          const base64Data = rawLogo.split(',')[1];
          if (base64Data) {
            const imageBuffer = Buffer.from(base64Data.replace(/\s/g, ''), 'base64');
            doc.image(imageBuffer, margin, logoY, { width: logoSize, height: logoSize });
          }
        } catch (_) {
          // ignore logo decode errors
        }
      }

      let yPos = 28;

      // Title "Payslip" centered, large bold
      doc.fontSize(22).font('Helvetica-Bold').fillColor('#000000');
      doc.text('Payslip', margin, yPos, { align: 'center', width: contentWidth });
      yPos += 28;

      doc.fontSize(12).font('Helvetica').fillColor('#000000');
      doc.text(schoolName, margin, yPos, { align: 'center', width: contentWidth });
      yPos += 16;
      if (schoolAddress && String(schoolAddress).trim()) {
        const addrLines = String(schoolAddress).trim().split('\n').slice(0, 3);
        for (const line of addrLines) {
          doc.text(line.trim(), margin, yPos, { align: 'center', width: contentWidth });
          yPos += 14;
        }
      }
      yPos += 8;

      // Two columns: Left (Date of Joining, Pay Period, Worked Days) | Right (Employee name, Designation, Department, National ID, Employee ID)
      const colW = contentWidth / 2;
      const leftX = margin;
      const rightX = margin + colW;
      const labelStyle = () => { doc.fontSize(10).font('Helvetica').fillColor('#000000'); };
      labelStyle();
      doc.text(`Date of Joining : ${dateOfJoining}`, leftX, yPos);
      doc.text(`Employee name : ${employeeName}`, rightX, yPos);
      yPos += 14;
      doc.text(`Pay Period : ${payPeriod}`, leftX, yPos);
      doc.text(`Designation : ${designation}`, rightX, yPos);
      yPos += 14;
      doc.text(`Worked Days : ${workedDays}`, leftX, yPos);
      doc.text(`Department : ${department}`, rightX, yPos);
      yPos += 14;
      doc.text(`National ID : ${nationalId ? String(nationalId).trim() : '—'}`, rightX, yPos);
      yPos += 14;
      doc.text(`Employee ID : ${employeeId}`, rightX, yPos);
      yPos += 22;

      // Ref line (small, right-aligned)
      doc.fontSize(8).fillColor('#666666');
      doc.text(`Ref: ${slipRef}`, margin, yPos, { width: contentWidth, align: 'right' });
      yPos += 14;

      const rawLines = (payrollEntry as any).lines || [];
      const lines = Array.isArray(rawLines) ? rawLines : [];
      const typeOf = (l: any) => String(l?.componentType || '').toLowerCase();
      const earningsLines = lines.filter((l: any) => typeOf(l) === 'basic' || typeOf(l) === 'allowance');
      const deductionLines = lines.filter((l: any) => typeOf(l) === 'deduction');

      const earningsItems: { label: string; amount: number }[] = [];
      const basicLines = earningsLines.filter((l: any) => typeOf(l) === 'basic');
      const allowanceLines = earningsLines.filter((l: any) => typeOf(l) === 'allowance');
      basicLines.forEach((l: any) => {
        earningsItems.push({ label: (l.componentName && String(l.componentName).trim()) ? l.componentName : 'Basic', amount: parseAmount(l.amount) });
      });
      allowanceLines.forEach((l: any) => {
        const name = (l.componentName || '').trim() || 'Allowance';
        earningsItems.push({ label: name, amount: parseAmount(l.amount) });
      });
      if (earningsItems.length === 0) {
        earningsItems.push({ label: 'Basic', amount: parseAmount(payrollEntry.grossSalary) });
      }

      const deductionItems: { label: string; amount: number }[] = [];
      deductionLines.forEach((l: any) => {
        const name = String(l.componentName || '').trim();
        const isLoan = /loan|repayment|salary advance/i.test(name);
        deductionItems.push({
          label: name ? (isLoan ? 'Loan' : name) : 'Deduction',
          amount: parseAmount(l.amount)
        });
      });
      if (deductionItems.length === 0) {
        deductionItems.push({ label: '—', amount: 0 });
      }

      const totalEarnings = earningsItems.reduce((s, i) => s + i.amount, 0);
      const totalDeductions = deductionItems.reduce((s, i) => s + i.amount, 0);
      const netPay = parseAmount(payrollEntry.netSalary);

      const numDataRows = Math.max(earningsItems.length, deductionItems.length);
      const totalTableRows = numDataRows + 3;
      const rowHeight = 20;
      const tableWidth = contentWidth;
      const c1W = tableWidth * 0.35;
      const c2W = tableWidth * 0.15;
      const c3W = tableWidth * 0.35;
      const c4W = tableWidth * 0.15;
      const tableX = margin;
      const col1X = tableX;
      const col2X = tableX + c1W;
      const col3X = tableX + c1W + c2W;
      const col4X = tableX + c1W + c2W + c3W;
      const borderColor = '#000000';

      const drawCell = (x: number, y: number, w: number, h: number, fill: string, stroke = true) => {
        doc.rect(x, y, w, h).fillColor(fill).fill();
        if (stroke) {
          doc.rect(x, y, w, h).strokeColor(borderColor).lineWidth(0.5).stroke();
        }
      };

      const headerBg = '#e9ecef';
      const dataBg = '#ffffff';

      for (let r = 0; r < totalTableRows; r++) {
        const rowY = yPos + r * rowHeight;
        const isHeader = r === 0;
        const isTotalRow = r === numDataRows + 1;
        const isNetPayRow = r === numDataRows + 2;
        const dataRowIndex = r - 1;

        const bg = isHeader ? headerBg : dataBg;
        drawCell(col1X, rowY, c1W, rowHeight, bg);
        drawCell(col2X, rowY, c2W, rowHeight, bg);
        drawCell(col3X, rowY, c3W, rowHeight, bg);
        drawCell(col4X, rowY, c4W, rowHeight, bg);

        doc.fontSize(10).fillColor('#000000');
        if (isHeader) {
          doc.font('Helvetica-Bold');
          doc.text('Earnings', col1X + 6, rowY + 6, { width: c1W - 12, align: 'center' });
          doc.text('Amount', col2X + 4, rowY + 6, { width: c2W - 8, align: 'center' });
          doc.text('Deductions', col3X + 6, rowY + 6, { width: c3W - 12, align: 'center' });
          doc.text('Amount', col4X + 4, rowY + 6, { width: c4W - 8, align: 'center' });
        } else if (isTotalRow) {
          doc.font('Helvetica-Bold');
          doc.text('Total Earnings', col1X + 6, rowY + 6, { width: c1W - 12 });
          doc.text(formatNumber(totalEarnings), col2X + 4, rowY + 6, { width: c2W - 8, align: 'right' });
          doc.text('Total Deductions', col3X + 6, rowY + 6, { width: c3W - 12 });
          doc.text(formatNumber(totalDeductions), col4X + 4, rowY + 6, { width: c4W - 8, align: 'right' });
        } else if (isNetPayRow) {
          doc.font('Helvetica-Bold');
          doc.text('Net Pay', col3X + 6, rowY + 6, { width: c3W - 12 });
          doc.text(formatNumber(netPay), col4X + 4, rowY + 6, { width: c4W - 8, align: 'right' });
        } else {
          doc.font('Helvetica');
          const earn = earningsItems[dataRowIndex];
          const ded = deductionItems[dataRowIndex];
          doc.text(earn ? earn.label.slice(0, 30) : '', col1X + 6, rowY + 6, { width: c1W - 12 });
          doc.text(earn ? formatNumber(earn.amount) : '', col2X + 4, rowY + 6, { width: c2W - 8, align: 'right' });
          doc.text(ded ? ded.label.slice(0, 30) : '', col3X + 6, rowY + 6, { width: c3W - 12 });
          doc.text(ded ? formatNumber(ded.amount) : '', col4X + 4, rowY + 6, { width: c4W - 8, align: 'right' });
        }
      }

      yPos += totalTableRows * rowHeight + 20;

      doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000');
      doc.text(formatNumber(netPay), margin, yPos, { align: 'center', width: contentWidth });
      yPos += 18;
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(numberToWords(netPay), margin, yPos, { align: 'center', width: contentWidth });
      yPos += 22;

      const paymentMethod = (payrollEntry as any).paymentMethod || (teacher as any)?.paymentMethod || (ancillaryStaff as any)?.paymentMethod || 'cash';
      const bankName = (payrollEntry as any).bankName || (teacher as any)?.bankName || (ancillaryStaff as any)?.bankName || '';
      const bankAccountNumber = (teacher as any)?.bankAccountNumber || (ancillaryStaff as any)?.bankAccountNumber || '';
      const showBankedAt = (paymentMethod === 'bank' || paymentMethod === 'both') && (bankName || bankAccountNumber);
      if (showBankedAt) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000');
        const bankedText = `Banked at: ${[String(bankName).trim(), String(bankAccountNumber).trim()].filter(Boolean).join(' ')}`;
        doc.text(bankedText, margin, yPos, { align: 'center', width: contentWidth });
        yPos += 18;
      }

      yPos += 10;

      const sigY = pageHeight - 90;
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text('Employer Signature', margin, sigY);
      doc.moveTo(margin, sigY + 18).lineTo(margin + 180, sigY + 18).strokeColor('#000000').lineWidth(0.5).stroke();
      doc.text('Employee Signature', margin + contentWidth - 120, sigY);
      doc.moveTo(margin + contentWidth - 180, sigY + 18).lineTo(margin + contentWidth, sigY + 18).strokeColor('#000000').lineWidth(0.5).stroke();

      if (typeof doc.switchToPage === 'function') {
        doc.switchToPage(0);
      }
      doc.fontSize(9).font('Helvetica').fillColor('#666666');
      doc.text('This is system generated payslip', margin, pageHeight - 28, { align: 'center', width: contentWidth });
      doc.text(`Generated on ${generatedAt}`, margin, pageHeight - 16, { align: 'center', width: contentWidth });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
