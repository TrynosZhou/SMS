/// <reference types="node" />

import PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';

interface StudentIdCardData {
  student: Student;
  settings: Settings | null;
  qrDataUrl: string;
  photoPath?: string | null;
}

function loadStudentPhoto(photoPath?: string | null): Buffer | null {
  if (!photoPath) {
    return null;
  }

  try {
    const normalizedPath = photoPath.replace(/^\//, '');
    const absolutePath = path.join(__dirname, '../../', normalizedPath);

    if (fs.existsSync(absolutePath)) {
      return fs.readFileSync(absolutePath);
    }
  } catch (error) {
    console.error('Failed to load student photo for ID card:', error);
  }

  return null;
}

export async function createStudentIdCardPDF(data: StudentIdCardData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const { student, settings, qrDataUrl, photoPath } = data;

      const doc = new PDFDocument({ size: [350, 220], margin: 16 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const schoolName = settings?.schoolName || 'School Management System';
      const schoolAddress = settings?.schoolAddress ? String(settings.schoolAddress).trim() : '';
      const schoolPhone = settings?.schoolPhone ? String(settings.schoolPhone).trim() : '';

      // Background
      doc.rect(0, 0, doc.page.width, doc.page.height)
        .fillColor('#F5F7FA')
        .fill();

      // Outer border
      doc.roundedRect(5, 5, doc.page.width - 10, doc.page.height - 10, 12)
        .lineWidth(2)
        .strokeColor('#1F4B99')
        .stroke();

      // Header bar
      doc.rect(10, 10, doc.page.width - 20, 36)
        .fillColor('#1F4B99')
        .fill();

      doc.fontSize(16).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text(schoolName, 15, 18, { width: doc.page.width - 30, align: 'center' });

      if (schoolAddress || schoolPhone) {
        doc.fontSize(8).font('Helvetica').fillColor('#E7ECF6');
        const contactLine = [schoolAddress, schoolPhone].filter(Boolean).join(' | ');
        doc.text(contactLine, 15, 34, { width: doc.page.width - 30, align: 'center' });
      }

      // Student information panel
      const infoBoxY = 56;
      doc.roundedRect(18, infoBoxY, 200, 120, 10)
        .fillColor('#FFFFFF')
        .fill()
        .strokeColor('#D7DFEB')
        .lineWidth(1)
        .stroke();

      // Student photo
      const photoBuffer = loadStudentPhoto(photoPath);
      const photoX = 26;
      const photoY = infoBoxY + 12;
      const photoSize = 60;

      doc.save();
      doc.roundedRect(photoX, photoY, photoSize, photoSize, 8)
        .clip()
        .fillColor('#E3E9F2')
        .fill();

      if (photoBuffer) {
        try {
          doc.image(photoBuffer, photoX, photoY, { width: photoSize, height: photoSize, align: 'center', valign: 'center' });
        } catch (error) {
          console.error('Failed to add student photo to ID card:', error);
        }
      } else {
        doc.fontSize(28).font('Helvetica-Bold').fillColor('#1F4B99');
        doc.text(student.gender === 'Male' ? '👦' : '👧', photoX, photoY + 8, { width: photoSize, align: 'center' });
      }

      doc.restore();

      const infoStartX = photoX + photoSize + 12;
      const infoStartY = photoY;

      doc.fontSize(12).font('Helvetica-Bold').fillColor('#1F4B99');
      doc.text(`${student.firstName} ${student.lastName}`.toUpperCase(), infoStartX, infoStartY, { width: 140 });

      doc.fontSize(10).font('Helvetica').fillColor('#344055');
      doc.text(`Student No: ${student.studentNumber}`, infoStartX, infoStartY + 22);
      doc.text(`Class: ${student.class?.name || 'N/A'}`, infoStartX, infoStartY + 38);
      doc.text(`Type: ${student.studentType || 'Day Scholar'}`, infoStartX, infoStartY + 54);

      if (student.dateOfBirth) {
        const dob = student.dateOfBirth instanceof Date ? student.dateOfBirth : new Date(student.dateOfBirth);
        doc.text(`DOB: ${dob.toLocaleDateString()}`, infoStartX, infoStartY + 70);
      }

      const contactInfo = student.contactNumber || student.phoneNumber;
      if (contactInfo) {
        doc.text(`Contact: ${contactInfo}`, infoStartX, infoStartY + 86, { width: 140 });
      }

      // QR Code and validity panel
      const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
      const qrSize = 78;
      const qrX = doc.page.width - qrSize - 28;
      const qrY = infoBoxY + 16;

      doc.roundedRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 20, 12)
        .fillColor('#FFFFFF')
        .fill()
        .strokeColor('#D7DFEB')
        .lineWidth(1)
        .stroke();

      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

      doc.fontSize(8).font('Helvetica').fillColor('#1F4B99');
      doc.text('Scan QR for verification', qrX - 4, qrY + qrSize + 2, { width: qrSize + 8, align: 'center' });

      // Footer bar
      const footerY = doc.page.height - 36;
      doc.rect(10, footerY, doc.page.width - 20, 24)
        .fillColor('#1F4B99')
        .fill();

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text('VALID STUDENT IDENTIFICATION CARD', 15, footerY + 6, { width: doc.page.width - 30, align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
