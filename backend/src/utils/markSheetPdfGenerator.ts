import PDFDocument from 'pdfkit';
import sizeOf from 'image-size';
import { Settings } from '../entities/Settings';

interface MarkSheetData {
  class: {
    id: string;
    name: string;
    form: string;
    classTeacherName?: string | null;
  };
  examType: string;
  subjects: Array<{
    id: string;
    name: string;
  }>;
  exams: Array<{
    id: string;
    name: string;
    examDate: Date;
    term: string | null;
  }>;
  markSheet: Array<{
    studentId: string;
    studentNumber: string;
    studentName: string;
    position: number;
    subjects: {
      [subjectId: string]: {
        subjectName: string;
        score: number;
        maxScore: number;
        percentage: number;
      };
    };
    totalScore: number;
    totalMaxScore: number;
    average: number;
    includeInClassPassRate?: boolean;
  }>;
  generatedAt: Date;
}

export function createMarkSheetPDF(
  markSheetData: MarkSheetData,
  settings: Settings | null
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const bannerHeight = 100;
      const bannerInset = 6;
      let headerTopY = 40;

      // Helper: add banner with contain fit and gold border (same as report card PDF)
      const addBannerCover = (
        imageBuffer: Buffer,
        startX: number,
        startY: number,
        width: number,
        height: number
      ) => {
        try {
          const dimensions = sizeOf(imageBuffer);
          const imgWidth = dimensions.width || width;
          const imgHeight = dimensions.height || height;
          const scaleX = width / imgWidth;
          const scaleY = height / imgHeight;
          const scale = Math.min(scaleX, scaleY);
          const finalWidth = imgWidth * scale;
          const finalHeight = imgHeight * scale;
          const offsetX = startX + (width - finalWidth) / 2;
          const offsetY = startY + (height - finalHeight) / 2;
          const radius = 14;
          doc.save();
          doc.roundedRect(startX, startY, width, height, radius)
            .fillColor('#1f4aa8')
            .fill();
          doc.roundedRect(startX, startY, width, height, radius).clip();
          doc.image(imageBuffer, offsetX, offsetY, { width: finalWidth, height: finalHeight });
          doc.restore();
          doc.save();
          doc.lineWidth(6);
          doc.strokeColor('#C9A227');
          doc.roundedRect(startX, startY, width, height, radius).stroke();
          doc.restore();
        } catch (error) {
          console.error('Could not add banner to mark sheet PDF:', error);
        }
      };

      // School banner (Logo 1) - fit like report card PDF
      const rawLogo = String(settings?.schoolLogo || '').trim();
      if (rawLogo) {
        try {
          let logoSource = rawLogo
            .replace(/^["']|["']$/g, '')
            .replace(/\\n/g, '')
            .replace(/\\r/g, '')
            .replace(/\\t/g, '')
            .replace(/\\"/g, '"');
          let imageBuffer: Buffer | null = null;
          if (logoSource.startsWith('data:image')) {
            const base64Data = logoSource.split(',')[1];
            if (base64Data) {
              imageBuffer = Buffer.from(base64Data.replace(/\s/g, ''), 'base64');
            }
          } else if (/^[A-Za-z0-9+/=\r\n]+$/.test(logoSource) && logoSource.length > 64) {
            imageBuffer = Buffer.from(logoSource.replace(/\s/g, ''), 'base64');
          }
          if (imageBuffer) {
            addBannerCover(
              imageBuffer,
              bannerInset,
              bannerInset,
              pageWidth - bannerInset * 2,
              bannerHeight
            );
            headerTopY = bannerInset + bannerHeight + 15;
          }
        } catch (error) {
          console.error('Could not add school banner (Logo 1) to mark sheet PDF:', error);
        }
      }

      // Pass rate: only students ticked for class pass rate (default included)
      const passRateRows = markSheetData.markSheet.filter(
        (r) => r.includeInClassPassRate !== false
      );
      const passCount = passRateRows.filter((r) => r.average >= 70).length;
      const passRate =
        passRateRows.length > 0 ? Math.round((passCount / passRateRows.length) * 100) : 0;
      let yPos = headerTopY;
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000');
      doc.text(`Pass Rate: ${passRate}% (students with 70% and above)`, 40, yPos);
      yPos += 18;

      // Class teacher name
      const classTeacherName = (markSheetData.class as any)?.classTeacherName;
      if (classTeacherName) {
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000');
        doc.text(`Class Teacher: ${classTeacherName}`, 40, yPos);
        yPos += 18;
      }

      // Title Section
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000');
      doc.text('MARK SHEET', 40, yPos, { align: 'center', width: doc.page.width - 80 });
      
      yPos += 25;
      doc.fontSize(12).font('Helvetica');
      doc.text(`Class: ${markSheetData.class.name} (${markSheetData.class.form})`, 40, yPos);
      doc.text(`Exam Type: ${markSheetData.examType.toUpperCase().replace('_', ' ')}`, doc.page.width - 200, yPos);
      
      yPos += 20;
      const generatedDate = new Date(markSheetData.generatedAt);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Generated: ${generatedDate.toLocaleDateString()} ${generatedDate.toLocaleTimeString()}`, 40, yPos);

      // Table Header
      yPos += 30;
      const tableStartY = yPos;
      const rowHeight = 28;
      const colWidths = {
        position: 35,
        studentNumber: 75,
        studentName: 200,
        subject: 60,
        total: 65,
        average: 55
      };

      // Calculate subject column width
      const availableWidth = doc.page.width - 80 - colWidths.position - colWidths.studentNumber - colWidths.studentName - colWidths.total - colWidths.average;
      const subjectColWidth = Math.max(50, availableWidth / markSheetData.subjects.length);

      // Header row 1
      doc.rect(40, yPos, doc.page.width - 80, rowHeight)
        .fillColor('#4a90e2')
        .fill();

      let xPos = 40;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFFFFF');
      
      // Position
      doc.text('Pos', xPos + 5, yPos + 8);
      xPos += colWidths.position;
      
      // Student Number
      doc.text('Student No.', xPos + 5, yPos + 8);
      xPos += colWidths.studentNumber;
      
      // Student Name
      doc.text('Student Name', xPos + 5, yPos + 8);
      xPos += colWidths.studentName;
      
      // Subjects header (spans multiple columns) - centered like reference
      doc.text('SUBJECTS', xPos, yPos + 8, {
        width: subjectColWidth * markSheetData.subjects.length,
        align: 'center'
      });
      xPos += subjectColWidth * markSheetData.subjects.length;
      
      // Total
      doc.text('Total', xPos + 5, yPos + 8);
      xPos += colWidths.total;
      
      // Average
      doc.text('Avg %', xPos + 5, yPos + 8);

      // Header row 2 - Subject names
      yPos += rowHeight;
      doc.rect(40, yPos, doc.page.width - 80, rowHeight)
        .fillColor('#4a90e2')
        .fill();

      xPos = 40;
      xPos += colWidths.position; // Skip position
      xPos += colWidths.studentNumber; // Skip student number
      xPos += colWidths.studentName; // Skip student name

      // Subject columns
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF');
      for (const subject of markSheetData.subjects) {
        doc.text(subject.name, xPos + 2, yPos + 10, { width: subjectColWidth - 4, align: 'center' });
        xPos += subjectColWidth;
      }

      // Table Body
      yPos += rowHeight;
      doc.fontSize(9).font('Helvetica').fillColor('#000000');

      for (let i = 0; i < markSheetData.markSheet.length; i++) {
        const row = markSheetData.markSheet[i];
        
        // Alternate row colors
        if (i % 2 === 0) {
          doc.rect(40, yPos, doc.page.width - 80, rowHeight)
            .fillColor('#F8F9FA')
            .fill();
        }

        xPos = 40;
        
        // Position
        doc.fillColor('#000000');
        doc.text(String(row.position), xPos + 5, yPos + 8);
        xPos += colWidths.position;
        
        // Student Number
        doc.text(row.studentNumber, xPos + 5, yPos + 8);
        xPos += colWidths.studentNumber;
        
        // Student Name - full name, no truncation; wrap if needed
        doc.text(row.studentName, xPos + 5, yPos + 6, { width: colWidths.studentName - 10 });
        xPos += colWidths.studentName;
        
        // Subject marks
        for (const subject of markSheetData.subjects) {
          const subjectData = row.subjects[subject.id];
          if (subjectData) {
            const markText = `${subjectData.score}/${subjectData.maxScore}`;
            doc.text(markText, xPos + 2, yPos + 8, { width: subjectColWidth - 4, align: 'center' });
          } else {
            doc.text('-', xPos + 2, yPos + 8, { width: subjectColWidth - 4, align: 'center' });
          }
          xPos += subjectColWidth;
        }
        
        // Total
        doc.font('Helvetica-Bold');
        doc.text(`${row.totalScore}/${row.totalMaxScore}`, xPos + 5, yPos + 8);
        xPos += colWidths.total;
        
        // Average
        doc.text(`${row.average.toFixed(1)}%`, xPos + 5, yPos + 8);
        doc.font('Helvetica');
        
        yPos += rowHeight;

        // Check if we need a new page
        if (yPos + rowHeight > doc.page.height - 40) {
          doc.addPage();
          yPos = 40;
        }
      }

      // Footer
      const footerY = doc.page.height - 40;
      doc.fontSize(9).font('Helvetica').fillColor('#666666');
      doc.text(`Total Students: ${markSheetData.markSheet.length}`, 40, footerY);
      doc.text(`Exams Included: ${markSheetData.exams.length}`, doc.page.width - 200, footerY);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

