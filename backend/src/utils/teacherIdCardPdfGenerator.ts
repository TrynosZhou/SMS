import PDFDocument from 'pdfkit';
import sizeOf from 'image-size';
import { Settings } from '../entities/Settings';

/** Teacher data for ID card */
export interface TeacherIdCardData {
  id: string;
  firstName: string;
  lastName: string;
  teacherId: string;
  photo?: string | null; // base64 data URL
  subjects?: Array<{ id: string; name: string }> | null;
  qrDataUrl?: string; // QR code as data URL
}

/** ID card size in points (horizontal card; left blue strip + main area) */
const CARD_WIDTH = 270;
const CARD_HEIGHT = 153;
const STRIP_WIDTH = 30; // left vertical blue strip
const MAIN_LEFT = STRIP_WIDTH;
const MAIN_WIDTH = CARD_WIDTH - STRIP_WIDTH;
const MARGIN = 10;
const BLUE_STRIP_COLOR = '#2563eb'; // medium blue
const BORDER_COLOR = '#1e3a8a'; // strong dark blue for border
const BORDER_WIDTH = 3; // strong border width

export function createTeacherIdCardPDF(
  teacher: TeacherIdCardData,
  settings: Settings | null
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // Single-page ID card: fixed size ensures no overflow to next page
      const doc = new PDFDocument({
        size: [CARD_WIDTH, CARD_HEIGHT],
        margin: 0,
        autoFirstPage: true
      });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // All from settings page: school name, logo, address
      const schoolName = settings?.schoolName || 'School';
      const schoolAddress = settings?.schoolAddress ? String(settings.schoolAddress).trim() : '';
      const academicYear = settings?.academicYear || new Date().getFullYear().toString();
      const fullName = `${teacher.firstName} ${teacher.lastName}`.trim();
      const subjectsText = teacher.subjects?.length
        ? teacher.subjects.map(s => s.name).join(', ')
        : 'Not assigned';
      const footerText = settings?.schoolMotto?.trim() || settings?.schoolEmail?.trim() || '';

      // ----- Left vertical blue strip -----
      doc.rect(0, 0, STRIP_WIDTH, CARD_HEIGHT).fill(BLUE_STRIP_COLOR);

      // Rotated text in strip: "TEACHER" and academic year (e.g. "2020-2021")
      const stripText = `TEACHER ${academicYear.replace(/\s/g, ' ')}`;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff');
      const tw = doc.widthOfString(stripText);
      const th = doc.heightOfString(stripText);
      doc.save();
      doc.translate(STRIP_WIDTH / 2, CARD_HEIGHT / 2);
      doc.rotate(-90);
      doc.text(stripText, -tw / 2, -th / 2);
      doc.restore();

      // ----- Main white area (with optional subtle background - we keep white) -----
      doc.rect(MAIN_LEFT, 0, MAIN_WIDTH, CARD_HEIGHT).fill('#ffffff');

      // Top: School name (from settings) starting from extreme left
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000');
      doc.text(schoolName, MAIN_LEFT + MARGIN, 12, { width: MAIN_WIDTH - MARGIN, align: 'left' });

      // School address (from settings) below name, aligned with school name
      let photoY = 30;
      if (schoolAddress) {
        doc.fontSize(7).font('Helvetica').fillColor('#4b5563');
        const addressHeight = doc.heightOfString(schoolAddress, { width: MAIN_WIDTH - MARGIN });
        doc.text(schoolAddress, MAIN_LEFT + MARGIN, 26, { width: MAIN_WIDTH - MARGIN, align: 'left' });
        photoY = 26 + addressHeight + 4;
      }

      // School logo: extreme top right of the card (before other content)
      const logoBoxSize = 50;
      const logoX = MAIN_LEFT + MAIN_WIDTH - MARGIN - logoBoxSize;
      const logoY = 8; // Top right
      if (settings?.schoolLogo && settings.schoolLogo.startsWith('data:image')) {
        try {
          const base64Data = settings.schoolLogo.split(',')[1];
          if (base64Data) {
            const imageBuffer = Buffer.from(base64Data, 'base64');
            const dimensions = sizeOf(imageBuffer);
            const imgW = dimensions.width || logoBoxSize;
            const imgH = dimensions.height || logoBoxSize;
            const scale = Math.min(logoBoxSize / imgW, logoBoxSize / imgH);
            const w = imgW * scale;
            const h = imgH * scale;
            const cx = logoX + (logoBoxSize - w) / 2;
            const cy = logoY + (logoBoxSize - h) / 2;
            doc.save();
            doc.image(imageBuffer, cx, cy, { width: w, height: h });
            doc.restore();
          }
        } catch (e) {
          console.error('Teacher ID card: school logo error', e);
        }
      }

      // Photo box (left side): passport-size with white border
      const photoX = MAIN_LEFT + MARGIN;
      const photoBoxWidth = 52;
      const photoBoxHeight = 62;

      if (teacher.photo && teacher.photo.startsWith('data:image')) {
        try {
          const base64Data = teacher.photo.split(',')[1];
          if (base64Data) {
            const imageBuffer = Buffer.from(base64Data, 'base64');
            doc.save();
            doc.image(imageBuffer, photoX, photoY, {
              fit: [photoBoxWidth, photoBoxHeight]
            });
            doc.restore();
          }
        } catch (e) {
          console.error('Teacher ID card: photo error', e);
        }
      }
      doc.rect(photoX, photoY, photoBoxWidth, photoBoxHeight)
        .strokeColor('#ffffff')
        .lineWidth(1.5)
        .stroke();
      doc.rect(photoX, photoY, photoBoxWidth, photoBoxHeight)
        .strokeColor('#e5e7eb')
        .lineWidth(0.5)
        .stroke();

      // Employee ID: centered between photo and right edge (logo is top right now)
      const photoRightEdge = photoX + photoBoxWidth;
      const logoLeftEdge = logoX;
      const centerX = (photoRightEdge + logoLeftEdge) / 2;
      const centerWidth = logoLeftEdge - photoRightEdge;
      const employeeIdY = photoY + photoBoxHeight / 2 - 6; // Vertically centered with photo
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000');
      doc.text(teacher.teacherId || '—', centerX - centerWidth / 2, employeeIdY, {
        width: centerWidth,
        align: 'center'
      });

      // Below Employee Number: Full name (bold), then more space, then Subject(s) taught
      const detailsX = centerX - centerWidth / 2;
      const detailsWidth = centerWidth;
      // Increased space between EmployeeID and Fullname (was 9pt, now 16pt)
      let detailsY = employeeIdY + 16;
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000');
      doc.text(fullName || '—', detailsX, detailsY, { width: detailsWidth, align: 'center' });
      // Increased space between full name and subjects (was 10pt, now 18pt)
      detailsY += 18;
      doc.fontSize(8).font('Helvetica').fillColor('#4b5563');
      doc.text(`Subject(s): ${subjectsText}`, detailsX, detailsY, { width: detailsWidth, align: 'center' });
      
      // School motto: just after subjects, moved down by one step
      if (footerText) {
        detailsY += 20; // Space after subjects (increased from 12 to 20 - one step down)
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000');
        doc.text(footerText, detailsX, detailsY, { width: detailsWidth, align: 'center' });
      }

      // QR Code: right side, below logo area (logo is now top right)
      if (teacher.qrDataUrl && teacher.qrDataUrl.startsWith('data:image')) {
        try {
          const qrBase64Data = teacher.qrDataUrl.split(',')[1];
          if (qrBase64Data) {
            const qrImageBuffer = Buffer.from(qrBase64Data, 'base64');
            const qrSize = 35;
            const qrX = logoX + (logoBoxSize - qrSize) / 2;
            const qrY = logoY + logoBoxSize + 8; // Below top-right logo
            
            // Add QR code with border
            doc.rect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4)
              .strokeColor('#e5e7eb')
              .lineWidth(0.5)
              .stroke();
            
            doc.save();
            doc.image(qrImageBuffer, qrX, qrY, { width: qrSize, height: qrSize });
            doc.restore();
            
            // Label below QR code
            doc.fontSize(6).font('Helvetica').fillColor('#4b5563');
            doc.text('Scan for details', qrX, qrY + qrSize + 2, { 
              width: qrSize, 
              align: 'center' 
            });
          }
        } catch (e) {
          console.error('Teacher ID card: QR code error', e);
        }
      }


      // Strong dark blue border around entire card
      doc.rect(0, 0, CARD_WIDTH, CARD_HEIGHT)
        .strokeColor(BORDER_COLOR)
        .lineWidth(BORDER_WIDTH)
        .stroke();

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
