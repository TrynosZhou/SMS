import PDFDocument from 'pdfkit';
import { Invoice } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { parseAmount } from './numberUtils';

interface InvoicePDFData {
  invoice: Invoice;
  student: Student;
  settings: Settings | null;
  /** When true, registration and desk fee line items are shown (charged once at registration). Omit for backward compatibility. */
  isFirstInvoice?: boolean;
}

export function createInvoicePDF(
  data: InvoicePDFData
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

      const { invoice, student, settings, isFirstInvoice } = data;
      const currencySymbol = settings?.currencySymbol || 'KES';

      // School Header
      const schoolName = settings?.schoolName || 'School Management System';
      const schoolAddress = settings?.schoolAddress ? String(settings.schoolAddress).trim() : '';
      const schoolPhone = settings?.schoolPhone || '';
      const schoolEmail = settings?.schoolEmail || '';

      // Header Section
      let yPos = 50;

      // School Logo (if available)
      if (settings?.schoolLogo) {
        try {
          if (settings.schoolLogo.startsWith('data:image')) {
            const base64Data = settings.schoolLogo.split(',')[1];
            if (base64Data) {
              const imageBuffer = Buffer.from(base64Data, 'base64');
              doc.image(imageBuffer, 50, yPos, { width: 80, height: 80 });
            }
          }
        } catch (error) {
          console.error('Could not add school logo to invoice:', error);
        }
      }

      // School Information
      const textStartX = settings?.schoolLogo ? 150 : 50;
      doc.fontSize(18).font('Helvetica-Bold').text(schoolName, textStartX, yPos);
      yPos += 25;

      if (schoolAddress) {
        doc.fontSize(10).font('Helvetica').text(schoolAddress, textStartX, yPos);
        yPos += 15;
      }

      if (schoolPhone) {
        doc.fontSize(10).font('Helvetica').text(`Phone: ${schoolPhone}`, textStartX, yPos);
        yPos += 15;
      }

      if (schoolEmail) {
        doc.fontSize(10).font('Helvetica').text(`Email: ${schoolEmail}`, textStartX, yPos);
        yPos += 15;
      }

      yPos += 20;

      // Horizontal divider line after header
      doc.strokeColor('#CCCCCC').lineWidth(1);
      doc.moveTo(50, yPos).lineTo(545, yPos).stroke();
      yPos += 15;

      // Invoice Title
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#003366');
      doc.text('INVOICE STATEMENT', 50, yPos, { align: 'center', width: 500 });
      yPos += 30;

      // Invoice Details Box with improved styling
      const detailsBoxY = yPos;
      const detailsBoxHeight = 110;
      doc.rect(50, detailsBoxY, 500, detailsBoxHeight)
        .fillColor('#F8F9FA')
        .fill()
        .strokeColor('#4A90E2')
        .lineWidth(2)
        .stroke();

      // Vertical divider line in details box
      const dividerX = 300;
      doc.strokeColor('#DEE2E6').lineWidth(0.5);
      doc.moveTo(dividerX, detailsBoxY + 5).lineTo(dividerX, detailsBoxY + detailsBoxHeight - 5).stroke();

      // Left Column - Invoice Info
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Invoice Number:', 60, detailsBoxY + 10);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(invoice.invoiceNumber, 60, detailsBoxY + 25);

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Invoice Date:', 60, detailsBoxY + 45);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(new Date(invoice.createdAt).toLocaleDateString(), 60, detailsBoxY + 60);

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Due Date:', 60, detailsBoxY + 80);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(new Date(invoice.dueDate).toLocaleDateString(), 60, detailsBoxY + 95);

      // Right Column - Student Info
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Bill To:', 320, detailsBoxY + 10);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(`${student.firstName} ${student.lastName}`, 320, detailsBoxY + 25);
      doc.text(`Student Number: ${student.studentNumber}`, 320, detailsBoxY + 40);
      if (student.classEntity) {
        doc.text(`Class: ${student.classEntity.name}`, 320, detailsBoxY + 55);
      }
      doc.text(`Term: ${invoice.term}`, 320, detailsBoxY + 70);

      yPos = detailsBoxY + detailsBoxHeight + 15;

      // Horizontal divider line before items table
      doc.strokeColor('#CCCCCC').lineWidth(1);
      doc.moveTo(50, yPos).lineTo(545, yPos).stroke();
      yPos += 15;

      // Items Table Section Header
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Invoice Details', 50, yPos);
      yPos += 25;

      // Table Header with improved styling
      // A4 page width is 595pt, with 50pt margins = 495pt usable width
      const tableStartX = 50;
      const tableEndX = 545; // Keep within page margins (50pt left + 495pt content + 50pt right = 595pt)
      const tableWidth = tableEndX - tableStartX; // 495pt
      const amountColumnWidth = 120; // Width for amount column
      const amountColumnStartX = tableEndX - amountColumnWidth; // Start position for amount column
      const rowHeight = 28;

      // Table header with border
      doc.rect(tableStartX, yPos, tableWidth, rowHeight)
        .fillColor('#4A90E2')
        .fill()
        .strokeColor('#003366')
        .lineWidth(2)
        .stroke();

      // Vertical divider in header
      doc.strokeColor('#FFFFFF').lineWidth(0.5);
      doc.moveTo(amountColumnStartX, yPos + 2).lineTo(amountColumnStartX, yPos + rowHeight - 2).stroke();

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text('Description', tableStartX + 10, yPos + 9);
      doc.text('Amount', amountColumnStartX, yPos + 9, { align: 'right', width: amountColumnWidth - 10 });

      yPos += rowHeight;

      const invoiceAmount = parseAmount(invoice.amount);
      const previousBalance = parseAmount(invoice.previousBalance);
      const paidAmount = parseAmount(invoice.paidAmount);
      const balance = parseAmount(invoice.balance);
      const prepaidAmount = parseAmount(invoice.prepaidAmount);
      const uniformTotal = parseAmount((invoice as any).uniformTotal);
      const baseAmount = parseFloat((invoiceAmount - uniformTotal).toFixed(2));

      const renderTableRow = (label: string, amountValue: number, options: { fill?: string; textColor?: string } = {}) => {
        doc.rect(tableStartX, yPos, tableWidth, rowHeight)
          .fillColor(options.fill || '#FFFFFF')
          .fill()
          .strokeColor('#CCCCCC')
          .lineWidth(0.5)
          .stroke();

        doc.strokeColor('#E0E0E0').lineWidth(0.5);
        doc.moveTo(amountColumnStartX, yPos + 2).lineTo(amountColumnStartX, yPos + rowHeight - 2).stroke();

        doc.fontSize(10).font('Helvetica').fillColor(options.textColor || '#000000');
        const maxDescriptionWidth = amountColumnStartX - tableStartX - 20;
        doc.text(label, tableStartX + 10, yPos + 9, { width: maxDescriptionWidth, ellipsis: true });
        doc.text(`${currencySymbol} ${amountValue.toFixed(2)}`, amountColumnStartX, yPos + 9, { align: 'right', width: amountColumnWidth - 10 });
        yPos += rowHeight;
      };

      if (previousBalance > 0) {
        renderTableRow('Previous Balance (Outstanding Fees)', previousBalance);
      }

      const descriptionText = (invoice.description || '').toString();
      const breakdownLine = descriptionText.split('\n').find(l => l.startsWith('Breakdown'));
      if (breakdownLine) {
        const partsRaw = breakdownLine.replace('Breakdown →', '').split('|').map(s => s.trim()).filter(Boolean);
        partsRaw.forEach(part => {
          const idx = part.lastIndexOf(':');
          if (idx > 0) {
            const label = part.substring(0, idx).trim();
            const amountStr = part.substring(idx + 1).trim();
            const amountVal = parseAmount(amountStr);
            if (amountVal > 0) {
              renderTableRow(label, amountVal, { fill: '#F8F9FA' });
            }
          }
        });
      }
      const adjustedLine = descriptionText.split('|').map(s => s.trim()).find(l => l.startsWith('Adjusted fees'));
      if (adjustedLine) {
        const inner = adjustedLine.replace('Adjusted fees (', '').replace(')', '');
        inner.split(',').map(s => s.trim()).forEach(item => {
          const idx = item.lastIndexOf(':');
          if (idx > 0) {
            const label = item.substring(0, idx).trim();
            const amountStr = item.substring(idx + 1).trim();
            const amountVal = parseAmount(amountStr);
            if (amountVal > 0) {
              renderTableRow(label, amountVal, { fill: '#F8F9FA' });
            }
          }
        });
      }

      if (uniformTotal > 0) {
        renderTableRow('School Uniform Subtotal', uniformTotal, { fill: '#FFE8CC', textColor: '#C05621' });
      }

      const discountLine = descriptionText.split('\n').find(l => l.toLowerCase().startsWith('discount applied'));
      const noteLines = descriptionText
        .split('|')
        .map(line => line.trim())
        .filter(line => line.toLowerCase().startsWith('credit note') || line.toLowerCase().startsWith('debit note'));

      if (discountLine || noteLines.length > 0) {
        yPos += 10;
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#2C3E50');
        doc.text('Adjustments', 50, yPos);
        yPos += 20;

        const adjRowHeight = 24;
        const renderAdjRow = (label: string, amountValue: number, options: { fill?: string; textColor?: string } = {}) => {
          doc.rect(tableStartX, yPos, tableWidth, adjRowHeight)
            .fillColor(options.fill || '#FFFFFF')
            .fill()
            .strokeColor('#CCCCCC')
            .lineWidth(0.5)
            .stroke();
          doc.strokeColor('#E0E0E0').lineWidth(0.5);
          doc.moveTo(amountColumnStartX, yPos + 2).lineTo(amountColumnStartX, yPos + adjRowHeight - 2).stroke();
          doc.fontSize(10).font('Helvetica').fillColor(options.textColor || '#000000');
          const maxDescriptionWidth = amountColumnStartX - tableStartX - 20;
          doc.text(label, tableStartX + 10, yPos + 7, { width: maxDescriptionWidth, ellipsis: true });
          doc.text(`${currencySymbol} ${amountValue.toFixed(2)}`, amountColumnStartX, yPos + 7, { align: 'right', width: amountColumnWidth - 10 });
          yPos += adjRowHeight;
        };

        if (discountLine) {
          const m = discountLine.match(/discount applied:\s*[A-Z]{0,3}\s*([0-9]+(\.[0-9]+)?)/i);
          if (m) {
            const amt = parseAmount(m[1]);
            if (amt > 0) {
              renderAdjRow('Discount Applied', amt, { fill: '#E8F5E9', textColor: '#1B5E20' });
            }
          }
        }

        noteLines.forEach(line => {
          const match = line.match(/([+-])\s*([0-9]+(\.[0-9]+)?)/);
          if (match) {
            const sign = match[1];
            const amountValue = parseFloat(match[2]);
            if (Number.isFinite(amountValue) && amountValue > 0) {
              const rowLabel = line.replace(/\s*\(([+-][0-9.]+\))\s*$/, '').trim() || line;
              const displayAmount = Math.abs(amountValue);
              renderAdjRow(rowLabel, displayAmount, {
                fill: '#FFF5F5',
                textColor: sign === '-' ? '#C53030' : '#2F855A'
              });
            }
          }
        });
      }

      // Horizontal divider before total
      yPos += 10;
      doc.strokeColor('#4A90E2').lineWidth(1.5);
      doc.moveTo(tableStartX, yPos).lineTo(tableEndX, yPos).stroke();
      yPos += 5;

      // Total Row with enhanced styling
      doc.rect(tableStartX, yPos, tableWidth, rowHeight + 5)
        .fillColor('#E8F4F8')
        .fill()
        .strokeColor('#4A90E2')
        .lineWidth(2.5)
        .stroke();

      // Vertical divider in total row
      doc.strokeColor('#4A90E2').lineWidth(1);
      doc.moveTo(amountColumnStartX, yPos + 2).lineTo(amountColumnStartX, yPos + rowHeight + 3).stroke();

      const totalInvoiceAmount = previousBalance + invoiceAmount;
      const appliedPrepaidAmount = Math.min(prepaidAmount, totalInvoiceAmount);
      const calculatedTotal = totalInvoiceAmount - appliedPrepaidAmount;
      const finalTotal = calculatedTotal;
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#003366');
      doc.text('Total Amount Due', tableStartX + 10, yPos + 10);
      doc.text(`${currencySymbol} ${finalTotal.toFixed(2)}`, amountColumnStartX, yPos + 10, { align: 'right', width: amountColumnWidth - 10 });
      yPos += rowHeight + 15;

      // Horizontal divider after total
      doc.strokeColor('#CCCCCC').lineWidth(1);
      doc.moveTo(tableStartX, yPos).lineTo(tableEndX, yPos).stroke();
      yPos += 20;

      // Payment Information Box
      if (paidAmount > 0 || prepaidAmount > 0) {
        const paymentBoxY = yPos;
        const paymentBoxHeight = 60 + (prepaidAmount > 0 ? 15 : 0);
        
        doc.rect(50, paymentBoxY, 500, paymentBoxHeight)
          .fillColor('#F0F8FF')
          .fill()
          .strokeColor('#4A90E2')
          .lineWidth(1.5)
          .stroke();

        doc.fontSize(12).font('Helvetica-Bold').fillColor('#2C3E50');
        doc.text('Payment Information', 60, paymentBoxY + 10);
        
        // Horizontal divider in payment box
        doc.strokeColor('#D0E0F0').lineWidth(0.5);
        doc.moveTo(60, paymentBoxY + 25).lineTo(540, paymentBoxY + 25).stroke();

        doc.fontSize(10).font('Helvetica').fillColor('#000000');
        let infoY = paymentBoxY + 35;
        
        if (paidAmount > 0) {
          doc.text(`Amount Paid: ${currencySymbol} ${paidAmount.toFixed(2)}`, 60, infoY);
          infoY += 15;
        }
        
        if (prepaidAmount > 0) {
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#1976D2');
          doc.text(`Prepaid Amount (for future terms): ${currencySymbol} ${prepaidAmount.toFixed(2)}`, 60, infoY);
          infoY += 15;
        }
        
        doc.fontSize(10).font('Helvetica').fillColor('#000000');
        doc.text(`Remaining Balance: ${currencySymbol} ${balance.toFixed(2)}`, 60, infoY);
        yPos = paymentBoxY + paymentBoxHeight + 20;
      }

      // Status Box
      const statusBoxY = yPos;
      doc.rect(50, statusBoxY, 500, 30)
        .fillColor('#FFFFFF')
        .fill()
        .strokeColor('#DEE2E6')
        .lineWidth(1)
        .stroke();

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Status:', 60, statusBoxY + 10);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      const statusRaw = (invoice.status as any) || 'pending';
      const statusStr = String(statusRaw);
      const statusText = statusStr.charAt(0).toUpperCase() + statusStr.slice(1);
      doc.text(statusText, 120, statusBoxY + 10);
      yPos = statusBoxY + 50;

      // Footer with divider line
      const pageHeight = doc.page.height;
      const footerY = pageHeight - 50;
      
      // Horizontal divider line before footer
      doc.strokeColor('#CCCCCC').lineWidth(0.5);
      doc.moveTo(50, footerY).lineTo(545, footerY).stroke();
      
      doc.fontSize(8).font('Helvetica').fillColor('#666666');
      doc.text(
        `Generated on: ${new Date().toLocaleString()}`,
        50,
        footerY + 10,
        { align: 'center', width: 500 }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

