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
  mode?: 'student' | 'transport';
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

function renderStudentIdCard(doc: InstanceType<typeof PDFDocument>, data: StudentIdCardData) {
  const { student, settings, qrDataUrl, photoPath, mode } = data;

  const schoolName = settings?.schoolName || 'School Management System';
  const schoolAddress = settings?.schoolAddress ? String(settings.schoolAddress).trim() : '';
  const schoolPhone = settings?.schoolPhone ? String(settings.schoolPhone).trim() : '';
  const schoolMotto = settings?.schoolMotto ? String(settings.schoolMotto).trim() : '';

  doc.rect(0, 0, doc.page.width, doc.page.height)
    .fillColor('#F5F7FA')
    .fill();

  doc.roundedRect(5, 5, doc.page.width - 10, doc.page.height - 10, 12)
    .lineWidth(2)
    .strokeColor('#1F4B99')
    .stroke();

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
  if (schoolMotto) {
    doc.fontSize(9).font('Helvetica-Oblique').fillColor('#FFFFFF');
    doc.text(schoolMotto, 15, 44, { width: doc.page.width - 30, align: 'center' });
  }

  const headerLogoY = 12;
  if (settings?.schoolLogo && settings.schoolLogo.startsWith('data:image')) {
    const base64Data = settings.schoolLogo.split(',')[1];
    if (base64Data) {
      const imageBuffer = Buffer.from(base64Data, 'base64');
      try {
        doc.image(imageBuffer, 16, headerLogoY, { width: 28 });
      } catch {}
    }
  }
  if (settings?.schoolLogo2 && settings.schoolLogo2.startsWith('data:image')) {
    const base64Data2 = settings.schoolLogo2.split(',')[1];
    if (base64Data2) {
      const imageBuffer2 = Buffer.from(base64Data2, 'base64');
      try {
        doc.image(imageBuffer2, doc.page.width - 44, headerLogoY, { width: 28 });
      } catch {}
    }
  }

  const infoBoxY = 56;
  doc.roundedRect(18, infoBoxY, 200, 120, 10)
    .fillColor('#FFFFFF')
    .fill()
    .strokeColor('#D7DFEB')
    .lineWidth(1)
    .stroke();

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
  doc.text(`Student No: ${student.studentNumber}`, infoStartX, infoStartY + 30);
  doc.text(`Class: ${student.classEntity?.name || 'N/A'}`, infoStartX, infoStartY + 48);
  doc.text(`Type: ${student.studentType || 'Day Scholar'}`, infoStartX, infoStartY + 66);

  if (student.dateOfBirth) {
    const dob = student.dateOfBirth instanceof Date ? student.dateOfBirth : new Date(student.dateOfBirth);
    doc.text(`DOB: ${dob.toLocaleDateString()}`, infoStartX, infoStartY + 84);
  }

  const contactInfo = student.contactNumber || student.phoneNumber;
  if (contactInfo) {
    doc.text(`Contact: ${contactInfo}`, infoStartX, infoStartY + 100, { width: 140 });
  }

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

  const footerY = doc.page.height - 36;
  doc.rect(10, footerY, doc.page.width - 20, 24)
    .fillColor('#1F4B99')
    .fill();

  const footerLabel = mode === 'transport' ? 'SCHOOL BUS ID CARD' : 'VALID STUDENT IDENTIFICATION CARD';

  doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFFFFF');
  doc.text(footerLabel, 15, footerY + 6, { width: doc.page.width - 30, align: 'center' });
}

export async function createStudentIdCardPDF(data: StudentIdCardData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [350, 220], margin: 16 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      renderStudentIdCard(doc, data);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export async function createStudentIdCardsPDFBatch(items: StudentIdCardData[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [350, 220], margin: 16 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      items.forEach((item, index) => {
        if (index > 0) {
          doc.addPage({ size: [350, 220], margin: 16 });
        }
        renderStudentIdCard(doc, item);
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
