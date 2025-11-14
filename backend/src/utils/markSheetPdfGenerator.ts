/// <reference types="node" />
import PDFDocument from 'pdfkit';
import { Settings } from '../entities/Settings';

interface MarkSheetData {
  class: {
    id: string;
    name: string;
    form: string;
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

      // School Header
      const schoolName = settings?.schoolName || 'School Management System';
      const schoolAddress = settings?.schoolAddress ? String(settings.schoolAddress).trim() : '';
      const schoolPhone = settings?.schoolPhone ? String(settings.schoolPhone).trim() : '';
      const academicYear = settings?.academicYear || new Date().getFullYear().toString();

      // Header with blue background
      doc.rect(0, 0, doc.page.width, 80)
        .fillColor('#4a90e2')
        .fill();

      doc.fontSize(20).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text(schoolName, 40, 25, { width: doc.page.width - 80, align: 'center' });

      if (schoolAddress || schoolPhone) {
        doc.fontSize(10).font('Helvetica').fillColor('#E8F4FD');
        const contactLine = [schoolAddress, schoolPhone].filter(Boolean).join(' | ');
        doc.text(contactLine, 40, 50, { width: doc.page.width - 80, align: 'center' });
      }

      // Title Section
      let yPos = 100;
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
      const rowHeight = 25;
      const colWidths = {
        position: 35,
        studentNumber: 70,
        studentName: 120,
        subject: 60,
        total: 60,
        average: 50
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
      
      // Subjects header (spans multiple columns)
      doc.text('SUBJECTS', xPos + 5, yPos + 8, { width: subjectColWidth * markSheetData.subjects.length });
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
        const subjectName = subject.name.length > 10 ? subject.name.substring(0, 8) + '..' : subject.name;
        doc.text(subjectName, xPos + 2, yPos + 10, { width: subjectColWidth - 4, align: 'center' });
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
        
        // Student Name
        const studentName = row.studentName.length > 18 ? row.studentName.substring(0, 16) + '..' : row.studentName;
        doc.text(studentName, xPos + 5, yPos + 8);
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

