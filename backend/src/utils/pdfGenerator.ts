import PDFDocument from 'pdfkit';
import axios from 'axios';
import sizeOf from 'image-size';
import { Settings } from '../entities/Settings';

interface ReportCardData {
  student: {
    id: string;
    name: string;
    studentNumber: string;
    class: string;
  };
  exam?: {
    name: string;
    type: string;
    examDate: Date;
  };
  examType?: string;
  exams?: Array<{
    id: string;
    name: string;
    examDate: Date;
  }>;
  subjects: Array<{
    subject: string;
    subjectCode?: string;
    score: number;
    maxScore: number;
    percentage: string;
    classAverage?: number;
    grade?: string;
    comments?: string;
  }>;
  overallAverage: string;
  overallGrade?: string;
  classPosition: number;
  formPosition?: number;
  totalStudents?: number;
  totalStudentsPerStream?: number;
  totalAttendance?: number;
  presentAttendance?: number;
  remarks?: {
    classTeacherRemarks?: string | null;
    headmasterRemarks?: string | null;
  };
  generatedAt: Date;
}

export function createReportCardPDF(
  reportCard: ReportCardData,
  settings: Settings | null
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      // Add strong black border around the entire page
      const pageWidth = doc.page.width;
      const initialPageHeight = doc.page.height;
      const borderWidth = 5; // Strong border
      const borderColor = '#000000'; // Black
      
      // Top border
      doc.rect(0, 0, pageWidth, borderWidth)
        .fillColor(borderColor)
        .fill();
      // Bottom border
      doc.rect(0, initialPageHeight - borderWidth, pageWidth, borderWidth)
        .fillColor(borderColor)
        .fill();
      // Left border
      doc.rect(0, 0, borderWidth, initialPageHeight)
        .fillColor(borderColor)
        .fill();
      // Right border
      doc.rect(pageWidth - borderWidth, 0, borderWidth, initialPageHeight)
        .fillColor(borderColor)
        .fill();

      // Additional dark-blue solid border inside the existing black border (keep black border intact)
      const innerBorderInset = borderWidth + 1;
      doc.save();
      doc.lineWidth(2);
      doc.strokeColor('#0b2f6b');
      doc.rect(
        innerBorderInset,
        innerBorderInset,
        pageWidth - innerBorderInset * 2,
        initialPageHeight - innerBorderInset * 2
      ).stroke();
      doc.restore();

      // School Header
      const schoolName = settings?.schoolName || 'School Management System';
      const schoolAddress = settings?.schoolAddress ? String(settings.schoolAddress).trim() : '';
      const schoolPhone = settings?.schoolPhone ? String(settings.schoolPhone).trim() : '';
      const academicYear = settings?.academicYear || new Date().getFullYear().toString();
      
      console.log('PDF Generator - Settings:', {
        hasSettings: !!settings,
        schoolName,
        schoolAddress: schoolAddress || 'EMPTY',
        academicYear,
        hasLogo: !!settings?.schoolLogo
      });

      let logoX = 50;
      const bannerHeight = 130;
      const bannerInset = 6;
      let headerTopY = (settings?.schoolLogo ? (borderWidth + bannerHeight + 20) : 55);
      const schoolNameFontSize = 14;
      // In PDFKit, text Y is baseline; ascender is the height from baseline to top of letters
      const textAscender = schoolNameFontSize * 0.7;
      const logoY = headerTopY;
      let logoWidth = 90;
      let logoHeight = 60;
      let textStartX = 160;
      let textEndX = pageWidth - 50; // Default end position (will be adjusted if logo2 exists)

      // Helper function to add logo with preserved aspect ratio
      // Aligns logo at the top (startY) to match school name alignment
      // Returns the actual width and height of the added logo
      const addLogoWithAspectRatio = (
        imageBuffer: Buffer,
        startX: number,
        startY: number,
        maxWidth: number,
        maxHeight: number
      ): { width: number; height: number; x: number } => {
        try {
          // Get image dimensions
          const dimensions = sizeOf(imageBuffer);
          const imgWidth = dimensions.width || maxWidth;
          const imgHeight = dimensions.height || maxHeight;
          
          // Calculate scale factor to fit within max dimensions while preserving aspect ratio
          const scaleX = maxWidth / imgWidth;
          const scaleY = maxHeight / imgHeight;
          const scale = Math.min(scaleX, scaleY); // Use smaller scale to ensure it fits
          
          // Calculate final dimensions
          const finalWidth = imgWidth * scale;
          const finalHeight = imgHeight * scale;
          
          // Center horizontally, but align at top vertically (to match school name)
          const centeredX = startX + (maxWidth - finalWidth) / 2;
          const alignedY = startY; // Align at top, not centered vertically
          
          // Draw the image only (save/restore so no path or stroke affects logos)
          doc.save();
          doc.image(imageBuffer, centeredX, alignedY, {
            width: finalWidth,
            height: finalHeight
          });
          doc.restore();
          
          return { width: finalWidth, height: finalHeight, x: centeredX };
        } catch (error) {
          console.error('Error adding logo with aspect ratio:', error);
          // Fallback: try to add image with max width (pdfkit will maintain aspect ratio)
          try {
            doc.save();
            doc.image(imageBuffer, startX, startY, { width: maxWidth });
            doc.restore();
          } catch (fallbackError) {
            console.error('Fallback logo addition also failed:', fallbackError);
          }
          return { width: maxWidth, height: maxHeight, x: startX };
        }
      };

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
          // Contain (no cropping) to match banner example
          const scale = Math.min(scaleX, scaleY);

          const finalWidth = imgWidth * scale;
          const finalHeight = imgHeight * scale;

          const offsetX = startX + (width - finalWidth) / 2;
          const offsetY = startY + (height - finalHeight) / 2;

          const radius = 14;

          doc.save();
          // Blue background + rounded corners
          doc.roundedRect(startX, startY, width, height, radius)
            .fillColor('#1f4aa8')
            .fill();
          doc.roundedRect(startX, startY, width, height, radius).clip();
          doc.image(imageBuffer, offsetX, offsetY, {
            width: finalWidth,
            height: finalHeight
          });
          doc.restore();
        } catch (error) {
          console.error('Error adding banner cover image:', error);
          try {
            doc.save();
            doc.image(imageBuffer, startX, startY, {
              width,
              height
            });
            doc.restore();
          } catch (fallbackError) {
            console.error('Fallback banner addition also failed:', fallbackError);
          }
        }
      };

      let logo1Info: { width: number; height: number; x: number } | null = null;
      let logo2Info: { width: number; height: number; x: number } | null = null;
      let bannerDrawn = false;

      // Draw logos with no stroke/border (save state, disable stroke, then restore after)
      doc.save();
      doc.lineWidth(0);

      if (settings?.schoolLogo) {
        try {
          let rawLogo = String(settings.schoolLogo || '').trim();

          // Handle values accidentally stored as quoted strings
          if ((rawLogo.startsWith('"') && rawLogo.endsWith('"')) || (rawLogo.startsWith("'") && rawLogo.endsWith("'"))) {
            rawLogo = rawLogo.slice(1, -1).trim();
          }

          // Unescape common sequences
          rawLogo = rawLogo
            .replace(/\\n/g, '')
            .replace(/\\r/g, '')
            .replace(/\\t/g, '')
            .replace(/\\"/g, '"');

          // 1) data URL banner
          if (rawLogo.startsWith('data:image')) {
            const base64Data = rawLogo.split(',')[1];
            if (base64Data) {
              const imageBuffer = Buffer.from(base64Data.replace(/\s/g, ''), 'base64');
              doc.save();
              addBannerCover(
                imageBuffer,
                borderWidth + bannerInset,
                borderWidth + bannerInset,
                pageWidth - (borderWidth + bannerInset) * 2,
                bannerHeight
              );
              doc.restore();
              bannerDrawn = true;
              textStartX = 50;
              logo1Info = null;
              console.log('School banner added to PDF successfully');
            } else {
              console.warn('School banner base64 data is empty');
            }
          }
          // 2) raw base64 banner (legacy)
          else if (/^[A-Za-z0-9+/=\r\n]+$/.test(rawLogo) && rawLogo.length > 64) {
            const imageBuffer = Buffer.from(rawLogo.replace(/\s/g, ''), 'base64');
            doc.save();
            addBannerCover(
              imageBuffer,
              borderWidth + bannerInset,
              borderWidth + bannerInset,
              pageWidth - (borderWidth + bannerInset) * 2,
              bannerHeight
            );
            doc.restore();
            bannerDrawn = true;
            textStartX = 50;
            logo1Info = null;
            console.log('School banner added to PDF successfully (raw base64)');
          }
          // 3) URL banner - fetch and embed
          else if (rawLogo.startsWith('http://') || rawLogo.startsWith('https://')) {
            try {
              const resp = await axios.get<ArrayBuffer>(rawLogo, { responseType: 'arraybuffer' });
              const imageBuffer = Buffer.from(resp.data as any);
              doc.save();
              addBannerCover(
                imageBuffer,
                borderWidth + bannerInset,
                borderWidth + bannerInset,
                pageWidth - (borderWidth + bannerInset) * 2,
                bannerHeight
              );
              doc.restore();
              bannerDrawn = true;
              textStartX = 50;
              logo1Info = null;
              console.log('School banner (URL) added to PDF successfully');
            } catch (fetchErr) {
              console.error('Failed to fetch school banner from URL for PDF:', fetchErr);
            }
          }
          // 4) anything else
          else {
            console.warn('School logo format not recognized:', rawLogo.substring(0, 50));
          }
        } catch (error) {
          console.error('Could not add school logo to PDF:', error);
        }
      } else {
        console.log('No school logo found in settings');
      }

      // Add Logo 2 on the right only if no banner (two-logo fallback)
      if (!bannerDrawn && (settings as any)?.schoolLogo2) {
        try {
          let rawLogo2 = String((settings as any).schoolLogo2 || '').trim();
          if ((rawLogo2.startsWith('"') && rawLogo2.endsWith('"')) || (rawLogo2.startsWith("'") && rawLogo2.endsWith("'"))) {
            rawLogo2 = rawLogo2.slice(1, -1).trim();
          }
          rawLogo2 = rawLogo2
            .replace(/\\n/g, '')
            .replace(/\\r/g, '')
            .replace(/\\t/g, '')
            .replace(/\\"/g, '"');

          const placeRight = async (buf: Buffer) => {
            const maxW = 120;
            const maxH = 100;
            const startX = pageWidth - 50 - maxW;
            const info2 = addLogoWithAspectRatio(buf, startX, headerTopY, maxW, maxH);
            textEndX = info2.x - 20;
            logo2Info = info2;
            logoHeight = Math.max(logoHeight, info2.height);
            console.log('School logo 2 (right) added to PDF successfully');
          };

          if (rawLogo2.startsWith('data:image')) {
            const base64Data2 = rawLogo2.split(',')[1];
            if (base64Data2) {
              await placeRight(Buffer.from(base64Data2.replace(/\s/g, ''), 'base64'));
            }
          } else if (/^[A-Za-z0-9+/=\r\n]+$/.test(rawLogo2) && rawLogo2.length > 64) {
            await placeRight(Buffer.from(rawLogo2.replace(/\s/g, ''), 'base64'));
          } else if (rawLogo2.startsWith('http://') || rawLogo2.startsWith('https://')) {
            try {
              const resp2 = await axios.get<ArrayBuffer>(rawLogo2, { responseType: 'arraybuffer' });
              await placeRight(Buffer.from(resp2.data as any));
            } catch (e2) {
              console.error('Failed to fetch schoolLogo2 for PDF:', e2);
            }
          }
        } catch (e) {
          console.error('Error handling schoolLogo2:', e);
        }
      }

      // If banner was drawn, push header content down and add right-side logo for visibility
      if (bannerDrawn) {
        headerTopY = borderWidth + bannerHeight + 10;
      }

      doc.restore();

      // Textual header (school name/address/phone/year) enabled: address on left
      const showTextHeader = false;
      let currentY = headerTopY;
      if (showTextHeader) {
        // Move text start to left margin to avoid overlap with left logo area
        textStartX = 50;
        doc.fontSize(schoolNameFontSize).font('Helvetica-Bold').text(schoolName, textStartX, headerTopY + textAscender);
        currentY = headerTopY + textAscender + 18;
        const maxTextWidth = textEndX - textStartX;
        const textWidth = Math.min(400, maxTextWidth);
        if (schoolAddress && schoolAddress.trim()) {
          doc.fontSize(10).font('Helvetica').text(schoolAddress.trim(), textStartX, currentY, { width: textWidth, align: 'left' });
          const addressHeight = doc.heightOfString(schoolAddress.trim(), { width: textWidth });
          currentY += addressHeight + 10;
        } else {
          currentY = logoY + 25;
        }
        if (schoolPhone && schoolPhone.trim()) {
          doc.fontSize(10).font('Helvetica').text(`Phone: ${schoolPhone.trim()}`, textStartX, currentY, { width: textWidth, align: 'left' });
          const phoneHeight = doc.heightOfString(`Phone: ${schoolPhone.trim()}`, { width: textWidth });
          currentY += phoneHeight + 10;
        } else {
          currentY += 5;
        }
        doc.fontSize(10).text(`Academic Year: ${academicYear}`, textStartX, currentY);
        currentY += 15;
      }

      // Title - adjust position based on logo size and header content with styled background
      // Ensure title is below all header content (logo, name, address, phone, academic year)
      const titleY = Math.max(currentY + 20, logoY + logoHeight + 20);
      const titleBoxHeight = 40;
      
      // Title background box - Blue color (fill only, no stroke to avoid lines near logos)
      doc.rect(50, titleY - 10, 500, titleBoxHeight)
        .fillColor('#1f4aa8')
        .fill();
      
      // Get exam type and academic year for the title bar
      const examTypeText = reportCard.examType || reportCard.exam?.type || '';
      const titleText = `REPORT CARD${examTypeText ? ` - ${examTypeText.toUpperCase()}` : ''}`;
      
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text(titleText, 50, titleY, { align: 'center', width: 500 });
      
      // Add academic year below REPORT CARD
      if (academicYear) {
        doc.fontSize(10).font('Helvetica').fillColor('#FFFFFF');
        doc.text(`Academic Year: ${academicYear}`, 50, titleY + 18, { align: 'center', width: 500 });
      }

      // Student Information - adjust position based on title with styled boxes (reduced spacing)
      const infoStartY = titleY + titleBoxHeight + 10; // Reduced spacing to fit more content
      
      // Student Information box
      doc.rect(50, infoStartY, 240, 80)
        .fillColor('#F8F9FA')
        .fill()
        .strokeColor('#DEE2E6')
        .lineWidth(1)
        .stroke();
      
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Student Information:', 60, infoStartY + 10);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(`Name: ${reportCard.student.name}`, 60, infoStartY + 30);
      doc.text(`Student Number: ${reportCard.student.studentNumber}`, 60, infoStartY + 50);
      doc.text(`Class: ${reportCard.student.class}`, 60, infoStartY + 70);

      // Exam Information box - increased height to fit Class Position and Grade Position
      doc.rect(300, infoStartY, 250, 100)
        .fillColor('#F8F9FA')
        .fill()
        .strokeColor('#DEE2E6')
        .lineWidth(1)
        .stroke();
      
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Exam Information:', 310, infoStartY + 10);
      doc.fontSize(9).font('Helvetica').fillColor('#000000');
      let examInfoY = infoStartY + 25;
      
      if (reportCard.exam) {
        doc.text(`Exam: ${reportCard.exam.name}`, 310, examInfoY);
        examInfoY += 15;
        doc.text(`Type: ${reportCard.exam.type}`, 310, examInfoY);
        examInfoY += 15;
        doc.text(`Date: ${new Date(reportCard.exam.examDate).toLocaleDateString()}`, 310, examInfoY);
        examInfoY += 15;
      } else if (reportCard.exams && reportCard.exams.length > 0) {
        // Remove duplicate exam names before displaying
        const uniqueExamNames = Array.from(new Set(reportCard.exams.map((e: any) => e.name)));
        doc.text(`Exams: ${uniqueExamNames.join(', ')}`, 310, examInfoY);
        examInfoY += 15;
      }
      
      // Add Class Position
      const totalStudents = reportCard.totalStudents || 0;
      const classPosText = totalStudents > 0 
        ? `Class Position: ${reportCard.classPosition} out of ${totalStudents}`
        : `Class Position: ${reportCard.classPosition}`;
      doc.text(classPosText, 310, examInfoY);
      examInfoY += 15;
      
      // Add Total Attendance
      if (reportCard.totalAttendance !== undefined && reportCard.totalAttendance !== null) {
        const attendanceText = `Total Attendance: ${reportCard.totalAttendance} day${reportCard.totalAttendance !== 1 ? 's' : ''}`;
        if (reportCard.presentAttendance !== undefined && reportCard.presentAttendance !== null) {
          doc.text(`${attendanceText} (Present: ${reportCard.presentAttendance})`, 310, examInfoY);
        } else {
          doc.text(attendanceText, 310, examInfoY);
        }
        examInfoY += 15;
      }

      // Grade Thresholds
      const thresholds = settings?.gradeThresholds || {
        excellent: 90,
        veryGood: 80,
        good: 60,
        satisfactory: 40,
        needsImprovement: 20,
        basic: 1
      };

      const gradeLabels = settings?.gradeLabels || {
        excellent: 'OUTSTANDING',
        veryGood: 'VERY HIGH',
        good: 'HIGH',
        satisfactory: 'GOOD',
        needsImprovement: 'ASPIRING',
        basic: 'BASIC',
        fail: 'UNCLASSIFIED'
      };

      const headmasterName = settings?.headmasterName ? String(settings.headmasterName).trim() : '';

      function getGrade(percentage: number): string {
        if (percentage === 0) return gradeLabels.fail || 'UNCLASSIFIED';
        if (percentage >= (thresholds.excellent || 90)) return gradeLabels.excellent || 'OUTSTANDING';
        if (percentage >= (thresholds.veryGood || 80)) return gradeLabels.veryGood || 'VERY HIGH';
        if (percentage >= (thresholds.good || 60)) return gradeLabels.good || 'HIGH';
        if (percentage >= (thresholds.satisfactory || 40)) return gradeLabels.satisfactory || 'GOOD';
        if (percentage >= (thresholds.needsImprovement || 20)) return gradeLabels.needsImprovement || 'ASPIRING';
        if (percentage >= (thresholds.basic || 1)) return gradeLabels.basic || 'BASIC';
        return gradeLabels.fail || 'UNCLASSIFIED';
      }

      function generateHeadmasterRemarkText(): string {
        const studentName = reportCard.student?.name ? String(reportCard.student.name).trim() : '';
        const namePart = studentName ? ` by ${studentName}` : '';
        const signature = headmasterName ? `. ${headmasterName}` : '';
        const rawAverage = reportCard.overallAverage;
        let average = 0;
        if (typeof rawAverage === 'number') {
          average = rawAverage;
        } else if (typeof rawAverage === 'string') {
          const parsed = parseFloat(rawAverage);
          average = isNaN(parsed) ? 0 : parsed;
        } else if (rawAverage != null) {
          const parsed = parseFloat(String(rawAverage));
          average = isNaN(parsed) ? 0 : parsed;
        }
        if (average >= 80) {
          return `Excellent performance${namePart}. Keep up the outstanding performance${signature}`;
        }
        if (average >= 70) {
          return `Very good performance${namePart}. Maintain this strong level of effort${signature}`;
        }
        if (average >= 60) {
          return `Good results${namePart}. Continued hard work will yield even better outcomes${signature}`;
        }
        if (average >= 50) {
          return `Satisfactory performance${namePart}. Greater consistency and focus are encouraged${signature}`;
        }
        if (average >= 40) {
          return `Performance is below expected level${namePart}. Increased effort and support at home and school are needed${signature}`;
        }
        return `The learner requires urgent and sustained support${namePart}. Close follow-up and serious commitment are essential for improvement${signature}`;
      }

      const storedHeadmasterRemarks =
        reportCard.remarks?.headmasterRemarks && String(reportCard.remarks.headmasterRemarks).trim().length
          ? String(reportCard.remarks.headmasterRemarks).trim()
          : '';
      const headmasterRemarks = storedHeadmasterRemarks || generateHeadmasterRemarkText();

      // Subjects Table - adjust position based on info section (reduced spacing for one page)
      let yPos = infoStartY + 100;
      doc.fontSize(10).font('Helvetica-Bold').text('Subject Performance:', 50, yPos);
      yPos += 16;

      // Define table dimensions - match Remarks section width (500pt) for right-edge alignment
      const tableStartX = 50;
      const tableWidth = 500; // Same as Remarks section doc.rect(50, ..., 500, ...)
      const tableEndXAdjusted = tableStartX + tableWidth;
      const rowHeight = 18;
      const headerRowHeight = 26;
      const colPadding = 5;
      const numCols = 6; // Subject, Subject Code, Mark Obtained, Possible Mark, Class Avg, Grade
      const fixedColWidth = 55; // markObtained, possibleMark, classAverage
      const flexibleTotal = tableWidth - (fixedColWidth * 3) - (colPadding * (numCols + 1));
      const colWidths = {
        subject: Math.round(flexibleTotal * 0.35),
        subjectCode: Math.round(flexibleTotal * 0.2),
        markObtained: fixedColWidth,
        possibleMark: fixedColWidth,
        classAverage: fixedColWidth,
        grade: Math.round(flexibleTotal * 0.45)
      };
      const colPositions = {
        subject: tableStartX + 5,
        subjectCode: tableStartX + colWidths.subject + 5,
        markObtained: tableStartX + colWidths.subject + colWidths.subjectCode + 5,
        possibleMark: tableStartX + colWidths.subject + colWidths.subjectCode + colWidths.markObtained + 5,
        classAverage: tableStartX + colWidths.subject + colWidths.subjectCode + colWidths.markObtained + colWidths.possibleMark + 5,
        grade: tableStartX + colWidths.subject + colWidths.subjectCode + colWidths.markObtained + colWidths.possibleMark + colWidths.classAverage + 5
      };

      // Table Header with background color
      const headerY = yPos;
      doc.rect(tableStartX, headerY, tableEndXAdjusted - tableStartX, headerRowHeight)
        .fillColor('#1f4aa8')
        .fill()
        .fillColor('#FFFFFF')
        .strokeColor('#000000')
        .lineWidth(1);

      // Header text with multi-line labels for narrower columns
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF');
      
      // Single-line headers (centered vertically in 26pt row)
      const singleLineY = headerY + (headerRowHeight / 2) - 3; // Center vertically, accounting for font height
      doc.text('Subject', colPositions.subject, singleLineY, { width: colWidths.subject - 10, align: 'center' });
      doc.text('Grade', colPositions.grade, singleLineY, { width: colWidths.grade - 10, align: 'center' });
      
      // Multi-line headers - positioned to allow space for descenders (g in "Avg", p, y, etc.)
      // Start at headerY + 4 to give adequate top padding, leaving room at bottom for descenders
      const multiLineY = headerY + 4;
      doc.text('Subject\nCode', colPositions.subjectCode, multiLineY, { width: colWidths.subjectCode - 10, align: 'center' });
      doc.text('Mark\nObtained', colPositions.markObtained, multiLineY, { width: colWidths.markObtained - 5, align: 'center' });
      doc.text('Possible\nMark', colPositions.possibleMark, multiLineY, { width: colWidths.possibleMark - 5, align: 'center' });
      doc.text('Class\nAvg', colPositions.classAverage, multiLineY, { width: colWidths.classAverage - 10, align: 'center' });

      // Calculate column boundaries for proper alignment (no Comments column)
      const colBoundaries = [
        tableStartX,
        tableStartX + colWidths.subject,
        tableStartX + colWidths.subject + colWidths.subjectCode,
        tableStartX + colWidths.subject + colWidths.subjectCode + colWidths.markObtained,
        tableStartX + colWidths.subject + colWidths.subjectCode + colWidths.markObtained + colWidths.possibleMark,
        tableStartX + colWidths.subject + colWidths.subjectCode + colWidths.markObtained + colWidths.possibleMark + colWidths.classAverage,
        tableEndXAdjusted
      ];

      // Draw header borders
      doc.strokeColor('#000000').lineWidth(1);
      // Top border
      doc.moveTo(tableStartX, headerY).lineTo(tableEndXAdjusted, headerY).stroke();
      // Bottom border
      doc.moveTo(tableStartX, headerY + headerRowHeight).lineTo(tableEndXAdjusted, headerY + headerRowHeight).stroke();
      // Vertical borders at column boundaries
      colBoundaries.forEach((boundary, index) => {
        if (index > 0 && index < colBoundaries.length) {
          doc.moveTo(boundary, headerY).lineTo(boundary, headerY + headerRowHeight).stroke();
        }
      });

      yPos = headerY + headerRowHeight;

      // Subjects Data with alternating row colors
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      for (let index = 0; index < reportCard.subjects.length; index++) {
        const subject = reportCard.subjects[index];
        const rowY = yPos;
        const isEvenRow = index % 2 === 0;

        const percentage = parseFloat(subject.percentage);
        const grade = subject.grade || (subject.grade === 'N/A' ? 'N/A' : getGrade(percentage));
        const scoreText = subject.grade === 'N/A' ? 'N/A' : Math.round(subject.score).toString();
        const maxScoreText = subject.grade === 'N/A' ? 'N/A' : Math.round(subject.maxScore).toString();
        
        const actualRowHeight = 18;
        
        // Alternate row background color
        if (isEvenRow) {
          doc.rect(tableStartX, rowY, tableEndXAdjusted - tableStartX, actualRowHeight)
            .fillColor('#F8F9FA')
            .fill();
        } else {
          doc.rect(tableStartX, rowY, tableEndXAdjusted - tableStartX, actualRowHeight)
            .fillColor('#FFFFFF')
            .fill();
        }

        // Draw cell borders using same column boundaries
        doc.strokeColor('#CCCCCC').lineWidth(0.5);
        // Top border
        doc.moveTo(tableStartX, rowY).lineTo(tableEndXAdjusted, rowY).stroke();
        // Bottom border
        doc.moveTo(tableStartX, rowY + actualRowHeight).lineTo(tableEndXAdjusted, rowY + actualRowHeight).stroke();
        // Vertical borders at column boundaries
        colBoundaries.forEach((boundary, idx) => {
          if (idx > 0 && idx < colBoundaries.length) {
            doc.moveTo(boundary, rowY).lineTo(boundary, rowY + actualRowHeight).stroke();
          }
        });

        // Cell text
        doc.fillColor('#000000');
        doc.text(subject.subject, colPositions.subject, rowY + 8, { width: colWidths.subject - 10 });
        
        // Subject Code
        const subjectCodeText = subject.subjectCode || '-';
        doc.text(subjectCodeText, colPositions.subjectCode, rowY + 8, { 
          width: colWidths.subjectCode - 10,
          align: 'center'
        });
        
        doc.text(scoreText, colPositions.markObtained, rowY + 8, { width: colWidths.markObtained - 10, align: 'center' });
        doc.text(maxScoreText, colPositions.possibleMark, rowY + 8, { width: colWidths.possibleMark - 10, align: 'center' });
        
        // Class Average (without % symbol)
        const classAverageText = subject.classAverage !== undefined && subject.classAverage !== null
          ? `${Math.round(subject.classAverage)}`
          : 'N/A';
        doc.text(classAverageText, colPositions.classAverage, rowY + 8, { width: colWidths.classAverage - 10, align: 'center' });
        
        // Grade - always black color, ensure text fits well
        if (grade === 'N/A') {
          doc.fillColor('#6C757D'); // Gray for N/A
        } else {
          doc.fillColor('#000000'); // Black for all grades
        }
        // Use smaller font size if grade is very long to ensure it fits
        const gradeWidth = colWidths.grade - 8; // Slightly more width for grade
        const gradeTextWidth = doc.widthOfString(grade);
        if (gradeTextWidth > gradeWidth) {
          doc.fontSize(8); // Slightly smaller font for long grades
        }
        doc.text(grade, colPositions.grade, rowY + 8, { width: gradeWidth });
        doc.fontSize(10); // Reset font size
        doc.fillColor('#000000'); // Reset to black
        
        yPos += actualRowHeight;

        // Calculate remaining space dynamically to show all subjects
        // A4 page height is 842pt, with 50pt margins = 742pt usable
        // Reserve space for sections below table:
        // Summary: ~45pt, Remarks: ~140pt, Footer: ~30pt = ~215pt
        // So table can extend up to ~527pt (742 - 215) to fit on one page
        // Only break if we absolutely must to prevent overflow
        const maxTableY = 527; // Allow table to use most of the page
        if (yPos > maxTableY) {
          // Only truncate if absolutely necessary (should rarely happen)
          break;
        }
      }

      // Summary Section with styled box (reduced spacing for one page)
      yPos += 10;
      const summaryBoxY = yPos;
      const summaryBoxHeight = 50; // Slightly increased to prevent overlapping
      
      // Summary box background
      doc.rect(50, summaryBoxY, 500, summaryBoxHeight)
        .fillColor('#E8F4F8')
        .fill()
        .strokeColor('#4A90E2')
        .lineWidth(2)
        .stroke();
      
      // Summary title
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Summary', 60, summaryBoxY + 8);
      
      // Summary content - improved spacing to prevent overlapping
      yPos = summaryBoxY + 22;
      doc.fontSize(9).font('Helvetica').fillColor('#003366'); // Dark blue
      const overallPercentage = parseFloat(reportCard.overallAverage);
      const overallGrade = reportCard.overallGrade || getGrade(overallPercentage);
      
      // Overall Average with colored background - positioned on the left
      const averageBoxX = 60;
      const averageBoxWidth = 220; // Increased width for better spacing and content
      doc.rect(averageBoxX, yPos - 5, averageBoxWidth, 20)
        .fillColor('#FFFFFF')
        .fill()
        .strokeColor('#CCCCCC')
        .lineWidth(1)
        .stroke();
      // Label in dark blue, value in different color
      doc.fillColor('#003366'); // Dark blue for label
      doc.text('Overall Average: ', averageBoxX + 5, yPos);
      // Calculate label width - widthOfString uses current font settings
      const labelWidth = doc.widthOfString('Overall Average: ');
      doc.fillColor('#1a237e'); // Darker blue for the value
      doc.text(`${Math.round(overallPercentage)}%`, averageBoxX + 5 + labelWidth, yPos);
      
      // Overall Grade - positioned on the right with proper spacing (20pt gap)
      const gradeBoxX = averageBoxX + averageBoxWidth + 20; // 20pt gap between boxes
      const gradeBoxWidth = 200; // Width for grade box
      doc.rect(gradeBoxX, yPos - 5, gradeBoxWidth, 20)
        .fillColor('#FFFFFF')
        .fill()
        .strokeColor('#CCCCCC')
        .lineWidth(1)
        .stroke();
      doc.fillColor('#003366'); // Dark blue for label
      doc.text('Overall Grade: ', gradeBoxX + 5, yPos);
      const overallGradeLabelWidth = doc.widthOfString('Overall Grade: ');
      doc.fillColor('#000000'); // Black for the value
      doc.text(overallGrade, gradeBoxX + 5 + overallGradeLabelWidth, yPos);
      
      // Class Position removed from Summary - now in Exam Information section

      // Remarks Section - Always display both sections (proper spacing to prevent overlap)
      yPos += 12; // Increased spacing between Summary and Remarks
      
      // Calculate dynamic height for remarks section (Class Teacher and Headmaster)
      const classTeacherRemarks = reportCard.remarks?.classTeacherRemarks || 'No remarks provided.';
      const maxRemarksTextHeight = 22;
      const teacherRemarksTextHeight = doc.heightOfString(classTeacherRemarks, { width: 480 });
      const teacherRemarksHeight = Math.min(maxRemarksTextHeight, Math.max(22, teacherRemarksTextHeight + 4));
      const headRemarksTextHeight = doc.heightOfString(headmasterRemarks, { width: 480 });
      const headRemarksHeight = Math.min(maxRemarksTextHeight, Math.max(22, headRemarksTextHeight + 4));
      const remarksTitleHeight = 24;
      const remarksBoxHeight = remarksTitleHeight + 18 + teacherRemarksHeight + 12 + headRemarksHeight + 27;
      
      // Remarks title with styled box - full blue background
      const remarksBoxY = yPos;
      
      doc.rect(50, remarksBoxY, 500, remarksBoxHeight)
        .fillColor('#1f4aa8')
        .fill()
        .strokeColor('#003366') // Dark blue border
        .lineWidth(2)
        .stroke();
      
      // Main "Remarks" title - larger and more prominent
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text('Remarks', 60, remarksBoxY + 8);
      yPos = remarksBoxY + 28; // Increased spacing after title
      
      // Class Teacher Remarks - Always display
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF'); // Bold white text for label
      doc.text('Class Teacher Remarks:', 60, yPos);
      yPos += 15; // Increased spacing before box
      
      // White rectangular box for Class Teacher Remarks
      doc.rect(60, yPos - 3, 480, teacherRemarksHeight)
        .fillColor('#FFFFFF')
        .fill()
        .strokeColor('#CCCCCC')
        .lineWidth(1)
        .stroke();
      
      doc.fontSize(8).font('Helvetica').fillColor('#000000'); // Black text for remarks content
      // Truncate text if needed to fit in box
      const teacherRemarksToShow = teacherRemarksTextHeight > maxRemarksTextHeight 
        ? classTeacherRemarks.substring(0, Math.floor(classTeacherRemarks.length * 0.8)) + '...'
        : classTeacherRemarks;
      doc.text(teacherRemarksToShow, 65, yPos, { width: 480 });
      yPos += teacherRemarksHeight + 12; // Increased spacing after teacher remarks

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text("Head's Remarks:", 60, yPos);
      yPos += 15;

      doc.rect(60, yPos - 3, 480, headRemarksHeight)
        .fillColor('#FFFFFF')
        .fill()
        .strokeColor('#CCCCCC')
        .lineWidth(1)
        .stroke();

      doc.fontSize(8).font('Helvetica').fillColor('#000000');
      const headRemarksToShow = headRemarksTextHeight > maxRemarksTextHeight
        ? headmasterRemarks.substring(0, Math.floor(headmasterRemarks.length * 0.8)) + '...'
        : headmasterRemarks;
      doc.text(headRemarksToShow, 65, yPos, { width: 480 });
      yPos += headRemarksHeight + 12;

      yPos += 10;

      // Grade Scale Footer Section (fit within single page, no new pages)
      yPos += 8; // Compact spacing after remarks
      
      const pageHeight = doc.page.height;

      // Calculate space available before footer
      const footerY = pageHeight - 25;
      const availableHeight = Math.max(0, footerY - yPos - 10); // keep small gap before footer
      
      // Only render grade scale if there is reasonable space
      if (availableHeight > 40) {
        // Grade Scale Title
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#003366');
        doc.text('Grade Scale / Attainment Levels', 50, yPos, { align: 'center', width: 500 });
        yPos += 12;

        // Grade Scale Box sized to available height
        const gradeScaleBoxY = yPos;
        const gradeScaleBoxHeight = Math.min(80, availableHeight - 12);
        doc.rect(50, gradeScaleBoxY, 500, gradeScaleBoxHeight)
          .fillColor('#F8F9FA')
          .fill()
          .strokeColor('#DEE2E6')
          .lineWidth(1)
          .stroke();

        // Grade Scale Items - arranged in rows
        const gradeItems = [
          { range: '90 – 100', label: gradeLabels.excellent || 'OUTSTANDING' },
          { range: '80 – 89', label: gradeLabels.veryGood || 'VERY HIGH' },
          { range: '60 – 79', label: gradeLabels.good || 'HIGH' },
          { range: '40 – 59', label: gradeLabels.satisfactory || 'GOOD' },
          { range: '20 – 39', label: gradeLabels.needsImprovement || 'ASPIRING' },
          { range: '1 – 19', label: gradeLabels.basic || 'BASIC' },
          { range: '0', label: gradeLabels.fail || 'UNCLASSIFIED' }
        ];

        // Calculate positions for grid layout (compact)
        const itemWidth = 115;
        const startX = 60;
        const startY = gradeScaleBoxY + 8;
        const rowGap = Math.max(28, gradeScaleBoxHeight / 3); // compact rows
        const colGap = 20;

        gradeItems.forEach((item, index) => {
          let row = Math.floor(index / 4);
          let col = index % 4;
          
          if (row === 1 && col >= 3) {
            col = col - 1;
          }
          
          let xPos;
          if (row === 1) {
            const lastRowStartX = startX + (itemWidth + colGap) * 0.5;
            xPos = lastRowStartX + col * (itemWidth + colGap);
          } else {
            xPos = startX + col * (itemWidth + colGap);
          }

          const yPosItem = startY + row * rowGap;

          doc.fontSize(8).font('Helvetica-Bold').fillColor('#003366');
          doc.text(item.range, xPos, yPosItem, { width: itemWidth });
          
          doc.fontSize(7).font('Helvetica').fillColor('#495057');
          doc.text(item.label, xPos, yPosItem + 10, { width: itemWidth });
        });
      }

      // Footer - Position at bottom of page, formatted date/time
      const genDate = new Date(reportCard.generatedAt);
      const pad = (n: number) => String(n).padStart(2, '0');
      const formatted = `${pad(genDate.getDate())}/${pad(genDate.getMonth() + 1)}/${genDate.getFullYear()}, ${pad(genDate.getHours())}:${pad(genDate.getMinutes())}:${pad(genDate.getSeconds())}`;
      const footerYFinal = pageHeight - 25;
      doc.fontSize(8).font('Helvetica').fillColor('#000000').text(
        `Generated on: ${formatted}`,
        50,
        footerYFinal,
        { align: 'center', width: 500 }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

