import PDFDocument from 'pdfkit';
import sizeOf from 'image-size';
import { Teacher } from '../entities/Teacher';
import { Class } from '../entities/Class';
import { Subject } from '../entities/Subject';
import { Settings } from '../entities/Settings';
import { RecordBook } from '../entities/RecordBook';
import { Student } from '../entities/Student';

interface RecordBookPDFData {
  teacher: Teacher;
  classEntity: Class;
  subject: Subject | null;
  students: Student[];
  records: RecordBook[];
  term: string;
  year: string;
  settings: Settings | null;
}

export function createRecordBookPDF(
  data: RecordBookPDFData
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

      const { teacher, classEntity, subject, students, records, term, year, settings } = data;

      // School Header
      const schoolName = settings?.schoolName || 'School Management System';
      const schoolAddress = settings?.schoolAddress ? String(settings.schoolAddress).trim() : '';
      const schoolPhone = settings?.schoolPhone ? String(settings.schoolPhone).trim() : '';
      const schoolEmail = settings?.schoolEmail ? String(settings.schoolEmail).trim() : '';

      // Header Section - Full width blue background with logo on right
      const headerHeight = 120;
      const pageWidth = doc.page.width;
      const margin = 40;
      const logoSize = 80; // Logo size
      const logoPadding = 10;

      // Helper function to add logo with preserved aspect ratio
      const addLogoWithAspectRatio = (
        imageBuffer: Buffer,
        startX: number,
        startY: number,
        maxWidth: number,
        maxHeight: number
      ) => {
        try {
          const dimensions = sizeOf(imageBuffer);
          const imgWidth = dimensions.width || maxWidth;
          const imgHeight = dimensions.height || maxHeight;
          
          const scaleX = maxWidth / imgWidth;
          const scaleY = maxHeight / imgHeight;
          const scale = Math.min(scaleX, scaleY);
          
          const finalWidth = imgWidth * scale;
          const finalHeight = imgHeight * scale;
          
          const centeredX = startX + (maxWidth - finalWidth) / 2;
          const centeredY = startY + (maxHeight - finalHeight) / 2;
          
          doc.image(imageBuffer, centeredX, centeredY, {
            width: finalWidth,
            height: finalHeight
          });
        } catch (error) {
          console.error('Error adding logo:', error);
        }
      };

      // Draw full-width blue background
      doc.rect(0, 0, pageWidth, headerHeight)
        .fillColor('#4a90e2')
        .fill();

      // Add Logo 2 on the right side with circular clipping (transparent effect)
      const logoAreaX = pageWidth - margin - logoSize - 10;
      const logoAreaY = (headerHeight - logoSize) / 2;
      const logoCenterX = logoAreaX + logoSize / 2;
      const logoCenterY = logoAreaY + logoSize / 2;
      const logoRadius = logoSize / 2;
      
      if (settings?.schoolLogo2) {
        try {
          if (settings.schoolLogo2.startsWith('data:image')) {
            const base64Data = settings.schoolLogo2.split(',')[1];
            if (base64Data) {
              const imageBuffer = Buffer.from(base64Data, 'base64');
              
              // Save graphics state, clip to circle, draw image, restore state
              doc.save();
              doc.circle(logoCenterX, logoCenterY, logoRadius).clip();
              addLogoWithAspectRatio(imageBuffer, logoAreaX, logoAreaY, logoSize, logoSize);
              doc.restore();
            }
          }
        } catch (error) {
          console.error('Could not add school logo 2 to record book PDF:', error);
        }
      }

      // Calculate text area (left of logo)
      const textStartX = margin;
      const textWidth = logoAreaX - margin - 20;

      // School name - large and bold
      doc.fontSize(24).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text(schoolName, textStartX, 15, { 
        width: textWidth, 
        align: 'center' 
      });

      // School address - full address
      let headerTextY = 45;
      if (schoolAddress) {
        doc.fontSize(11).font('Helvetica').fillColor('#FFFFFF');
        doc.text(schoolAddress, textStartX, headerTextY, { 
          width: textWidth, 
          align: 'center' 
        });
        headerTextY += 18;
      }

      // School contact info (phone and email)
      if (schoolPhone || schoolEmail) {
        doc.fontSize(10).font('Helvetica').fillColor('#FFFFFF');
        
        let contactLine = '';
        if (schoolPhone) {
          contactLine += `Tel: ${schoolPhone}`;
        }
        if (schoolEmail) {
          if (contactLine) contactLine += '  |  ';
          contactLine += `Email: ${schoolEmail}`;
        }
        
        if (contactLine) {
          doc.text(contactLine, textStartX, headerTextY, { 
            width: textWidth, 
            align: 'center' 
          });
          headerTextY += 16;
        }
      }

      // Add "RECORD BOOK" subtitle in header
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text('RECORD BOOK', textStartX, headerTextY + 5, { 
        width: textWidth, 
        align: 'center' 
      });

      // Details Section (below header)
      let yPos = headerHeight + 15;
      doc.fontSize(12).font('Helvetica').fillColor('#000000');
      
      // Format teacher name as LastName FirstName (consistent with system)
      // Handle placeholder names - if it's "Teacher Account", show just EmployeeID
      const isPlaceholder = teacher.firstName === 'Teacher' && teacher.lastName === 'Account';
      let teacherDisplayName: string;
      if (isPlaceholder) {
        teacherDisplayName = teacher.teacherId || 'Teacher';
      } else {
        const lastName = teacher.lastName?.trim() || '';
        const firstName = teacher.firstName?.trim() || '';
        teacherDisplayName = `${lastName} ${firstName}`.trim() || teacher.teacherId || 'Teacher';
      }
      
      doc.text(`Teacher: ${teacherDisplayName} (${teacher.teacherId})`, 40, yPos);
      doc.text(`Class: ${classEntity.name}`, doc.page.width - 200, yPos);
      
      yPos += 20;
      if (subject) {
        doc.text(`Subject: ${subject.name}`, 40, yPos);
        doc.text(`Term: ${term}`, doc.page.width - 200, yPos);
      } else {
        doc.text(`Term: ${term}`, 40, yPos);
        doc.text(`Year: ${year}`, doc.page.width - 200, yPos);
      }
      
      yPos += 20;
      if (subject) {
        doc.text(`Year: ${year}`, 40, yPos);
      }
      
      yPos += 30;

      // Create records map for quick lookup
      const recordsMap = new Map(records.map(r => [r.studentId, r]));

      // Extract topics and dates from first record (they should be the same for all students)
      const firstRecord = records.length > 0 ? records[0] : null;
      const topics = [
        firstRecord?.test1Topic || '',
        firstRecord?.test2Topic || '',
        firstRecord?.test3Topic || '',
        firstRecord?.test4Topic || '',
        firstRecord?.test5Topic || '',
        firstRecord?.test6Topic || '',
        firstRecord?.test7Topic || '',
        firstRecord?.test8Topic || '',
        firstRecord?.test9Topic || '',
        firstRecord?.test10Topic || ''
      ];
      
      const formatDate = (date: Date | null): string => {
        if (!date) return '';
        const d = new Date(date);
        const year = d.getFullYear().toString().slice(-2);
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${day}.${month}.${year}`;
      };
      
      const dates = [
        formatDate(firstRecord?.test1Date || null),
        formatDate(firstRecord?.test2Date || null),
        formatDate(firstRecord?.test3Date || null),
        formatDate(firstRecord?.test4Date || null),
        formatDate(firstRecord?.test5Date || null),
        formatDate(firstRecord?.test6Date || null),
        formatDate(firstRecord?.test7Date || null),
        formatDate(firstRecord?.test8Date || null),
        formatDate(firstRecord?.test9Date || null),
        formatDate(firstRecord?.test10Date || null)
      ];

      // Table Header with dates
      const tableTop = yPos;
      const headerRowHeight = 30; // Increased to accommodate date
      const rowHeight = 20;
      const colWidths = [30, 80, 100, 100, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50];
      const headers = ['#', 'Student ID', 'Last Name', 'First Name', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10'];
      
      // Header row background
      doc.rect(40, tableTop, doc.page.width - 80, headerRowHeight)
        .fillColor('#e8f4fd')
        .fill();

      // Draw header text with dates
      let xPos = 40;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
      headers.forEach((header, index) => {
        if (index < 4) {
          // Student info columns
          doc.text(header, xPos + 5, tableTop + 8, { width: colWidths[index] - 10, align: index === 0 ? 'center' : 'left' });
        } else {
          // Test columns with dates
          const testNum = index - 3;
          const dateStr = dates[testNum - 1] || '';
          doc.text(header, xPos + 5, tableTop + 5, { width: colWidths[index] - 10, align: 'center' });
          if (dateStr) {
            doc.fontSize(7).font('Helvetica').fillColor('#666666');
            doc.text(dateStr, xPos + 5, tableTop + 18, { width: colWidths[index] - 10, align: 'center' });
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
          }
        }
        xPos += colWidths[index];
      });

      // Draw header borders
      doc.strokeColor('#4a90e2').lineWidth(1);
      doc.moveTo(40, tableTop).lineTo(40, tableTop + headerRowHeight).stroke();
      xPos = 40;
      headers.forEach((_, index) => {
        xPos += colWidths[index];
        doc.moveTo(xPos, tableTop).lineTo(xPos, tableTop + headerRowHeight).stroke();
      });
      doc.moveTo(doc.page.width - 40, tableTop).lineTo(doc.page.width - 40, tableTop + headerRowHeight).stroke();
      doc.moveTo(40, tableTop).lineTo(doc.page.width - 40, tableTop).stroke();
      doc.moveTo(40, tableTop + headerRowHeight).lineTo(doc.page.width - 40, tableTop + headerRowHeight).stroke();

      // Student rows
      let currentY = tableTop + headerRowHeight;
      students.forEach((student, index) => {
        // Check if we need a new page
        if (currentY + rowHeight > doc.page.height - 100) {
          doc.addPage();
          currentY = headerHeight + 20;
          
          // Redraw header on new page
          doc.rect(40, currentY, doc.page.width - 80, headerRowHeight)
            .fillColor('#e8f4fd')
            .fill();
          
          xPos = 40;
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
          headers.forEach((header, idx) => {
            if (idx < 4) {
              doc.text(header, xPos + 5, currentY + 8, { width: colWidths[idx] - 10, align: idx === 0 ? 'center' : 'left' });
            } else {
              const testNum = idx - 3;
              const dateStr = dates[testNum - 1] || '';
              doc.text(header, xPos + 5, currentY + 5, { width: colWidths[idx] - 10, align: 'center' });
              if (dateStr) {
                doc.fontSize(7).font('Helvetica').fillColor('#666666');
                doc.text(dateStr, xPos + 5, currentY + 18, { width: colWidths[idx] - 10, align: 'center' });
                doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
              }
            }
            xPos += colWidths[idx];
          });
          
          doc.strokeColor('#4a90e2').lineWidth(1);
          doc.moveTo(40, currentY).lineTo(40, currentY + headerRowHeight).stroke();
          xPos = 40;
          headers.forEach((_, idx) => {
            xPos += colWidths[idx];
            doc.moveTo(xPos, currentY).lineTo(xPos, currentY + headerRowHeight).stroke();
          });
          doc.moveTo(doc.page.width - 40, currentY).lineTo(doc.page.width - 40, currentY + headerRowHeight).stroke();
          doc.moveTo(40, currentY).lineTo(doc.page.width - 40, currentY).stroke();
          doc.moveTo(40, currentY + headerRowHeight).lineTo(doc.page.width - 40, currentY + headerRowHeight).stroke();
          
          currentY += headerRowHeight;
        }

        const record = recordsMap.get(student.id);
        const rowData = [
          (index + 1).toString(),
          student.studentNumber,
          student.lastName,
          student.firstName,
          record?.test1 !== null && record?.test1 !== undefined ? record.test1.toString() : '',
          record?.test2 !== null && record?.test2 !== undefined ? record.test2.toString() : '',
          record?.test3 !== null && record?.test3 !== undefined ? record.test3.toString() : '',
          record?.test4 !== null && record?.test4 !== undefined ? record.test4.toString() : '',
          record?.test5 !== null && record?.test5 !== undefined ? record.test5.toString() : '',
          record?.test6 !== null && record?.test6 !== undefined ? record.test6.toString() : '',
          record?.test7 !== null && record?.test7 !== undefined ? record.test7.toString() : '',
          record?.test8 !== null && record?.test8 !== undefined ? record.test8.toString() : '',
          record?.test9 !== null && record?.test9 !== undefined ? record.test9.toString() : '',
          record?.test10 !== null && record?.test10 !== undefined ? record.test10.toString() : ''
        ];

        // Alternate row colors
        if (index % 2 === 0) {
          doc.rect(40, currentY, doc.page.width - 80, rowHeight)
            .fillColor('#f8f9fa')
            .fill();
        }

        // Draw row borders
        doc.strokeColor('#dee2e6').lineWidth(0.5);
        doc.moveTo(40, currentY).lineTo(doc.page.width - 40, currentY).stroke();
        doc.moveTo(40, currentY + rowHeight).lineTo(doc.page.width - 40, currentY + rowHeight).stroke();
        
        xPos = 40;
        headers.forEach((_, idx) => {
          xPos += colWidths[idx];
          doc.moveTo(xPos, currentY).lineTo(xPos, currentY + rowHeight).stroke();
        });

        // Draw row text
        xPos = 40;
        doc.fontSize(8).font('Helvetica').fillColor('#000000');
        rowData.forEach((cell, idx) => {
          const align = idx === 0 ? 'center' : (idx < 4 ? 'left' : 'center');
          doc.text(cell, xPos + 5, currentY + 6, { width: colWidths[idx] - 10, align });
          xPos += colWidths[idx];
        });

        currentY += rowHeight;
      });

      // Add topics row after all students
      if (topics.some(t => t)) {
        // Alternate row color for topics
        doc.rect(40, currentY, doc.page.width - 80, rowHeight)
          .fillColor('#f1f3f5')
          .fill();

        // Draw topic row borders
        doc.strokeColor('#dee2e6').lineWidth(0.5);
        doc.moveTo(40, currentY).lineTo(doc.page.width - 40, currentY).stroke();
        doc.moveTo(40, currentY + rowHeight).lineTo(doc.page.width - 40, currentY + rowHeight).stroke();
        
        xPos = 40;
        headers.forEach((_, idx) => {
          xPos += colWidths[idx];
          doc.moveTo(xPos, currentY).lineTo(xPos, currentY + rowHeight).stroke();
        });

        // Draw topic labels
        xPos = 40;
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#495057');
        doc.text('TOPIC', xPos + 5, currentY + 6, { width: 310 - 10, align: 'right' }); // Span first 4 columns
        xPos += 310; // Skip first 4 columns
        
        topics.forEach((topic, idx) => {
          if (idx < 10) {
            doc.fontSize(7).font('Helvetica').fillColor('#495057');
            const topicText = topic || '';
            doc.text(topicText, xPos + 2, currentY + 6, { width: colWidths[idx + 4] - 4, align: 'center' });
            xPos += colWidths[idx + 4];
          }
        });

        currentY += rowHeight;
      }

      // Footer
      const footerY = doc.page.height - 40;
      doc.fontSize(8).font('Helvetica').fillColor('#666666');
      doc.text(
        `Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`,
        40,
        footerY,
        { width: doc.page.width - 80, align: 'center' }
      );

      doc.end();
    } catch (error: any) {
      reject(error);
    }
  });
}

