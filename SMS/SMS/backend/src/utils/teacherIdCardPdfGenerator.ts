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

/** ID card size in points (horizontal card) */
const CARD_WIDTH = 270;
const CARD_HEIGHT = 153;
const HEADER_HEIGHT = 20;
const FOOTER_HEIGHT = 24;
const MARGIN = 10;
const MAIN_LEFT = MARGIN;
const MAIN_WIDTH = CARD_WIDTH - 2 * MARGIN;
const HEADER_COLOR = '#1e3a8a';
const FOOTER_COLOR = '#1e3a8a';
const BORDER_COLOR = '#1e3a8a';
const BORDER_WIDTH = 3;
const DARK_BLUE_TEXT = '#1e3a8a';

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

      doc.rect(0, 0, CARD_WIDTH, CARD_HEIGHT).fill('#ffffff');
      doc.rect(0, 0, CARD_WIDTH, HEADER_HEIGHT).fill(HEADER_COLOR);
      doc.rect(0, CARD_HEIGHT - FOOTER_HEIGHT, CARD_WIDTH, FOOTER_HEIGHT).fill(FOOTER_COLOR);

      // Top: School name (from settings) under the header, leaving space on the right for logo
      const titleY = HEADER_HEIGHT + 10;
      doc.fontSize(14).font('Helvetica-Bold').fillColor(DARK_BLUE_TEXT);
      doc.text(schoolName, MAIN_LEFT, titleY, { width: MAIN_WIDTH - 70, align: 'left' });

      // School address (from settings) below name, aligned with school name
      let photoY = titleY + 24;
      if (schoolAddress) {
        doc.fontSize(7).font('Helvetica-Bold').fillColor(DARK_BLUE_TEXT);
        const addressHeight = doc.heightOfString(schoolAddress, { width: MAIN_WIDTH - 70 });
        doc.text(schoolAddress, MAIN_LEFT, titleY + 18, { width: MAIN_WIDTH - 70, align: 'left' });
        photoY = titleY + 18 + addressHeight + 6;
      }

      // School logo: top right of the card body
      const logoBoxSize = 50;
      const logoX = CARD_WIDTH - MARGIN - logoBoxSize;
      const logoY = HEADER_HEIGHT + 4;
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
      const photoX = MAIN_LEFT;
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

      const designationY = photoY + photoBoxHeight + 4;
      doc.fontSize(8).font('Helvetica').fillColor(DARK_BLUE_TEXT);
      doc.text('Designation: Teacher', photoX, designationY, {
        width: photoBoxWidth,
        align: 'left'
      });

      // Name and Employee ID to the right of the photo (to match sample card)
      const photoRightEdge = photoX + photoBoxWidth + 8;
      const centerX = photoRightEdge + (CARD_WIDTH - MARGIN - photoRightEdge) / 2;
      const centerWidth = CARD_WIDTH - MARGIN - photoRightEdge;
      const detailsX = centerX - centerWidth / 2;
      const detailsWidth = centerWidth;
      let detailsY = photoY + 4;

      // Teacher full name (slightly smaller so motto fits comfortably)
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000');
      doc.text(fullName || '—', detailsX, detailsY, { width: detailsWidth, align: 'left' });
      detailsY += 16;

      // Employee ID line: "ID# 123456"
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000');
      const idLabel = 'ID# ';
      const idValue = teacher.teacherId || '—';
      const idLine = `${idLabel}${idValue}`;
      doc.text(idLine, detailsX, detailsY, { width: detailsWidth, align: 'left' });
      detailsY += 14;

      // Subject(s)
      doc.fontSize(8).font('Helvetica').fillColor(DARK_BLUE_TEXT);
      doc.text(`Subject(s): ${subjectsText}`, detailsX, detailsY, { width: detailsWidth, align: 'left' });
      detailsY += 14;

      if (teacher.qrDataUrl && teacher.qrDataUrl.startsWith('data:image')) {
        try {
          const qrBase64Data = teacher.qrDataUrl.split(',')[1];
          if (qrBase64Data) {
          const qrImageBuffer = Buffer.from(qrBase64Data, 'base64');
          const qrSize = 30;
          const qrX = CARD_WIDTH - MARGIN - qrSize;
          const qrY = CARD_HEIGHT - FOOTER_HEIGHT - qrSize - 4;

            doc.rect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4)
              .strokeColor('#e5e7eb')
              .lineWidth(0.5)
              .stroke();

            doc.save();
            doc.image(qrImageBuffer, qrX, qrY, { width: qrSize, height: qrSize });
            doc.restore();

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

      if (footerText) {
        const footerY = CARD_HEIGHT - FOOTER_HEIGHT - 10;
        doc.fontSize(8).font('Helvetica-Oblique').fillColor('#4b5563');
        doc.text(footerText, MAIN_LEFT, footerY, {
          width: MAIN_WIDTH,
          align: 'center'
        });
      }

      const footerTextY = CARD_HEIGHT - FOOTER_HEIGHT / 2 - 6;
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#ffffff');
      doc.text('TEACHER', MARGIN, footerTextY, {
        width: CARD_WIDTH / 2 - MARGIN,
        align: 'left'
      });
      doc.text(academicYear, CARD_WIDTH / 2, footerTextY, {
        width: CARD_WIDTH / 2 - MARGIN,
        align: 'right'
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
