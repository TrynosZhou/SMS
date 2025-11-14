/// <reference types="node" />
import PDFDocument from 'pdfkit';
import { Invoice } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';

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

export function createReceiptPDF(
  data: ReceiptPDFData
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

      const { invoice, student, settings, paymentAmount, paymentDate, paymentMethod, notes, receiptNumber, isPrepayment } = data;
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
          console.error('Could not add school logo to receipt:', error);
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

      // Receipt Title
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#28A745');
      doc.text('PAYMENT RECEIPT', 50, yPos, { align: 'center', width: 500 });
      yPos += 30;

      // Receipt Details Box with improved styling
      const detailsBoxY = yPos;
      const detailsBoxHeight = 110;
      doc.rect(50, detailsBoxY, 500, detailsBoxHeight)
        .fillColor('#F8F9FA')
        .fill()
        .strokeColor('#28A745')
        .lineWidth(2)
        .stroke();

      // Vertical divider line in details box
      const dividerX = 300;
      doc.strokeColor('#DEE2E6').lineWidth(0.5);
      doc.moveTo(dividerX, detailsBoxY + 5).lineTo(dividerX, detailsBoxY + detailsBoxHeight - 5).stroke();

      // Left Column - Receipt Info
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Receipt Number:', 60, detailsBoxY + 10);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(receiptNumber, 60, detailsBoxY + 25);

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Payment Date:', 60, detailsBoxY + 45);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(paymentDate.toLocaleDateString(), 60, detailsBoxY + 60);

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Invoice Number:', 60, detailsBoxY + 80);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(invoice.invoiceNumber, 60, detailsBoxY + 95);

      // Right Column - Student Info
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Received From:', 320, detailsBoxY + 10);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(`${student.firstName} ${student.lastName}`, 320, detailsBoxY + 25);
      doc.text(`Student Number: ${student.studentNumber}`, 320, detailsBoxY + 40);
      if (student.class) {
        doc.text(`Class: ${student.class.name}`, 320, detailsBoxY + 55);
      }
      doc.text(`Term: ${invoice.term}`, 320, detailsBoxY + 70);

      yPos = detailsBoxY + detailsBoxHeight + 15;

      // Horizontal divider line before payment details
      doc.strokeColor('#CCCCCC').lineWidth(1);
      doc.moveTo(50, yPos).lineTo(545, yPos).stroke();
      yPos += 15;

      // Payment Details Section Header
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Payment Details', 50, yPos);
      yPos += 25;

      // A4 page width is 595pt, with 50pt margins = 495pt usable width
      const tableStartX = 50;
      const tableEndX = 545; // Keep within page margins
      const tableWidth = tableEndX - tableStartX; // 495pt
      const amountColumnWidth = 150; // Width for amount column
      const amountColumnStartX = tableEndX - amountColumnWidth; // Start position for amount column
      const rowHeight = 25;

      // Payment Amount Row with header-like styling
      doc.rect(tableStartX, yPos, tableWidth, rowHeight)
        .fillColor('#E8F5E9')
        .fill()
        .strokeColor('#28A745')
        .lineWidth(1.5)
        .stroke();

      // Vertical divider in payment amount row
      doc.strokeColor('#28A745').lineWidth(0.5);
      doc.moveTo(amountColumnStartX, yPos + 2).lineTo(amountColumnStartX, yPos + rowHeight - 2).stroke();

      // Ensure paymentAmount is a number
      const paymentAmountNum = parseFloat(String(paymentAmount || 0));
      
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000');
      doc.text('Amount Paid', tableStartX + 10, yPos + 9);
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#28A745');
      doc.text(`${currencySymbol} ${paymentAmountNum.toFixed(2)}`, amountColumnStartX, yPos + 9, { align: 'right', width: amountColumnWidth - 10 });
      yPos += rowHeight;

      // Prepaid Amount Row (if this is a prepayment)
      if (isPrepayment) {
        doc.rect(tableStartX, yPos, tableWidth, rowHeight)
          .fillColor('#E3F2FD')
          .fill()
          .strokeColor('#2196F3')
          .lineWidth(0.5)
          .stroke();

        doc.strokeColor('#BBDEFB').lineWidth(0.5);
        doc.moveTo(amountColumnStartX, yPos + 2).lineTo(amountColumnStartX, yPos + rowHeight - 2).stroke();

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1976D2');
        doc.text('Prepaid Amount (for future terms)', tableStartX + 10, yPos + 9);
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1976D2');
        doc.text(`${currencySymbol} ${paymentAmountNum.toFixed(2)}`, amountColumnStartX, yPos + 9, { align: 'right', width: amountColumnWidth - 10 });
        yPos += rowHeight;
      }

      // Payment Method Row
      if (paymentMethod) {
        doc.rect(tableStartX, yPos, tableWidth, rowHeight)
          .fillColor('#F8F9FA')
          .fill()
          .strokeColor('#CCCCCC')
          .lineWidth(0.5)
          .stroke();

        // Vertical divider line
        doc.strokeColor('#E0E0E0').lineWidth(0.5);
        doc.moveTo(amountColumnStartX, yPos + 2).lineTo(amountColumnStartX, yPos + rowHeight - 2).stroke();

        doc.fontSize(10).font('Helvetica').fillColor('#000000');
        doc.text('Payment Method', tableStartX + 10, yPos + 9);
        // Payment method text should fit in the available space
        const methodColumnWidth = amountColumnWidth;
        const methodColumnStartX = amountColumnStartX;
        doc.text(paymentMethod, methodColumnStartX, yPos + 9, { align: 'right', width: methodColumnWidth - 10 });
        yPos += rowHeight;
      }
      yPos += 10;

      // Horizontal divider before invoice summary
      doc.strokeColor('#CCCCCC').lineWidth(1);
      doc.moveTo(tableStartX, yPos).lineTo(tableEndX, yPos).stroke();
      yPos += 15;

      // Invoice Summary Section Header
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Invoice Summary', 50, yPos);
      yPos += 25;

      // Ensure all numeric values are properly converted to numbers
      const invoiceAmount = parseFloat(String(invoice.amount || 0));
      const previousBalance = parseFloat(String(invoice.previousBalance || 0));
      const paidAmount = parseFloat(String(invoice.paidAmount || 0));
      const balance = parseFloat(String(invoice.balance || 0));
      const prepaidAmount = parseFloat(String(invoice.prepaidAmount || 0));

      // Invoice Summary Box
      const summaryBoxY = yPos;
      const summaryBoxHeight = 90 + (previousBalance > 0 ? 15 : 0) + (prepaidAmount > 0 ? 15 : 0);
      doc.rect(50, summaryBoxY, 500, summaryBoxHeight)
        .fillColor('#FFF9E6')
        .fill()
        .strokeColor('#FFC107')
        .lineWidth(1.5)
        .stroke();
      
      yPos = summaryBoxY + 15;

      // Use a consistent layout for invoice summary with proper alignment
      const summaryLabelWidth = 300; // Width for labels
      const summaryValueStartX = tableStartX + summaryLabelWidth; // Start position for values
      const summaryValueWidth = tableEndX - summaryValueStartX; // Available width for values

      // Horizontal divider in summary box
      doc.strokeColor('#FFE082').lineWidth(0.5);
      doc.moveTo(60, yPos - 5).lineTo(540, yPos - 5).stroke();

      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text('Invoice Amount:', tableStartX + 10, yPos);
      doc.text(`${currencySymbol} ${invoiceAmount.toFixed(2)}`, summaryValueStartX, yPos, { align: 'right', width: summaryValueWidth });
      yPos += 15;

      if (previousBalance > 0) {
        doc.text('Previous Balance:', tableStartX + 10, yPos);
        doc.text(`${currencySymbol} ${previousBalance.toFixed(2)}`, summaryValueStartX, yPos, { align: 'right', width: summaryValueWidth });
        yPos += 15;
      }

      if (prepaidAmount > 0) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1976D2');
        doc.text('Prepaid Amount:', tableStartX + 10, yPos);
        doc.text(`${currencySymbol} ${prepaidAmount.toFixed(2)}`, summaryValueStartX, yPos, { align: 'right', width: summaryValueWidth });
        yPos += 15;
      }

      // Horizontal divider before totals
      doc.strokeColor('#FFE082').lineWidth(0.5);
      doc.moveTo(60, yPos - 2).lineTo(540, yPos - 2).stroke();
      yPos += 3;

      doc.text('Total Invoice Amount:', tableStartX + 10, yPos);
      doc.text(`${currencySymbol} ${(invoiceAmount + previousBalance).toFixed(2)}`, summaryValueStartX, yPos, { align: 'right', width: summaryValueWidth });
      yPos += 15;

      doc.text('Total Paid (including this payment):', tableStartX + 10, yPos);
      doc.text(`${currencySymbol} ${paidAmount.toFixed(2)}`, summaryValueStartX, yPos, { align: 'right', width: summaryValueWidth });
      yPos += 15;

      // Horizontal divider before remaining balance
      doc.strokeColor('#FFC107').lineWidth(1);
      doc.moveTo(60, yPos - 2).lineTo(540, yPos - 2).stroke();
      yPos += 3;

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#DC3545');
      doc.text('Remaining Balance:', tableStartX + 10, yPos);
      doc.text(`${currencySymbol} ${balance.toFixed(2)}`, summaryValueStartX, yPos, { align: 'right', width: summaryValueWidth });
      yPos = summaryBoxY + summaryBoxHeight + 20;

      // Horizontal divider after invoice summary
      doc.strokeColor('#CCCCCC').lineWidth(1);
      doc.moveTo(50, yPos).lineTo(545, yPos).stroke();
      yPos += 15;

      // Notes section with box
      if (notes) {
        const notesBoxY = yPos;
        const notesBoxHeight = 50;
        
        doc.rect(50, notesBoxY, 500, notesBoxHeight)
          .fillColor('#F5F5F5')
          .fill()
          .strokeColor('#DEE2E6')
          .lineWidth(1)
          .stroke();

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50');
        doc.text('Notes:', 60, notesBoxY + 10);
        
        // Horizontal divider in notes box
        doc.strokeColor('#E0E0E0').lineWidth(0.5);
        doc.moveTo(60, notesBoxY + 20).lineTo(540, notesBoxY + 20).stroke();

        doc.fontSize(9).font('Helvetica').fillColor('#000000');
        // Wrap text if too long
        doc.text(notes, 60, notesBoxY + 30, { width: 480, align: 'left' });
        yPos = notesBoxY + notesBoxHeight + 20;
      }

      // Status Box
      const statusBoxY = yPos;
      doc.rect(50, statusBoxY, 500, 30)
        .fillColor('#E8F5E9')
        .fill()
        .strokeColor('#28A745')
        .lineWidth(1.5)
        .stroke();

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Payment Status:', 60, statusBoxY + 10);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#28A745');
      const statusText = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);
      doc.text(statusText, 180, statusBoxY + 10);
      yPos = statusBoxY + 50;

      // Thank You Message Box
      const thankYouBoxY = yPos;
      doc.rect(50, thankYouBoxY, 500, 35)
        .fillColor('#E8F5E9')
        .fill()
        .strokeColor('#28A745')
        .lineWidth(2)
        .stroke();

      doc.fontSize(12).font('Helvetica-Bold').fillColor('#28A745');
      doc.text('Thank you for your payment!', 50, thankYouBoxY + 12, { align: 'center', width: 500 });
      yPos = thankYouBoxY + 50;

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

