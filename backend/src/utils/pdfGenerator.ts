import PDFDocument from 'pdfkit';
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
  return new Promise((resolve, reject) => {
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
      // Single header top Y: both logos and school name start at the same height
      const headerTopY = 55;
      const schoolNameFontSize = 16;
      // In PDFKit, text Y is baseline; ascender is the height from baseline to top of letters
      const textAscender = schoolNameFontSize * 0.7;
      const logoY = headerTopY; // Both logos: top edge at headerTopY
      let logoWidth = 120; // Maximum width for logo
      let logoHeight = 100; // Maximum height for logo
      let textStartX = 180; // Adjusted to accommodate wider logo
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

      let logo1Info: { width: number; height: number; x: number } | null = null;
      let logo2Info: { width: number; height: number; x: number } | null = null;

      // Draw logos with no stroke/border (save state, disable stroke, then restore after)
      doc.save();
      doc.lineWidth(0);

      // Add school logo if available (left side)
      if (settings?.schoolLogo) {
        try {
          // If it's a base64 image
          if (settings.schoolLogo.startsWith('data:image')) {
            const base64Data = settings.schoolLogo.split(',')[1];
            if (base64Data) {
              const imageBuffer = Buffer.from(base64Data, 'base64');
              logo1Info = addLogoWithAspectRatio(imageBuffer, logoX, logoY, logoWidth, logoHeight);
              textStartX = logoX + logoWidth + 20; // Start text after logo
              console.log('School logo added to PDF successfully');
            } else {
              console.warn('School logo base64 data is empty');
            }
          } else if (settings.schoolLogo.startsWith('http://') || settings.schoolLogo.startsWith('https://')) {
            // If it's a URL, we could fetch it, but for now skip
            console.warn('URL-based logos not yet supported in PDF');
          } else {
            console.warn('School logo format not recognized:', settings.schoolLogo.substring(0, 50));
          }
        } catch (error) {
          console.error('Could not add school logo to PDF:', error);
        }
      } else {
        console.log('No school logo found in settings');
      }

      // Add school logo 2 if available (right side) - positioned on extreme right
      if (settings?.schoolLogo2) {
        try {
          if (settings.schoolLogo2.startsWith('data:image')) {
            const base64Data = settings.schoolLogo2.split(',')[1];
            if (base64Data) {
              const imageBuffer = Buffer.from(base64Data, 'base64');
              
              // Calculate position for right-side logo
              // Position it on the extreme right with appropriate margin
              const rightMargin = 50; // 50px margin from right edge
              const logo2MaxX = pageWidth - rightMargin; // Maximum X position (right edge minus margin)
              
              // Calculate the starting X position (accounting for max width)
              // We'll position it so the logo's right edge aligns with the page margin
              const logo2StartX = logo2MaxX - logoWidth;
              
              // Add the logo and get its actual dimensions
              logo2Info = addLogoWithAspectRatio(imageBuffer, logo2StartX, logoY, logoWidth, logoHeight);
              
              // Adjust text end position to leave space for logo (use actual logo width)
              textEndX = logo2Info.x - 20; // Leave 20px gap between text and logo
              
              console.log('School logo 2 added to PDF successfully on the right side');
            } else {
              console.warn('School logo 2 base64 data is empty');
            }
          } else if (settings.schoolLogo2.startsWith('http://') || settings.schoolLogo2.startsWith('https://')) {
            console.warn('URL-based logos not yet supported in PDF');
          } else {
            console.warn('School logo 2 format not recognized:', settings.schoolLogo2.substring(0, 50));
          }
        } catch (error) {
          console.error('Could not add school logo 2 to PDF:', error);
        }
      }

      doc.restore();

      // School Name and Address — school name top aligned with headerTopY (baseline = top + ascender)
      doc.fontSize(schoolNameFontSize).font('Helvetica-Bold').text(schoolName, textStartX, headerTopY + textAscender);
      
      // Calculate positions for address and academic year (below school name line)
      let currentY = headerTopY + textAscender + 18;
      
      // Calculate available width for text (accounting for both logos if present)
      const maxTextWidth = textEndX - textStartX; // Space between logo1 and logo2 (or end of page)
      const textWidth = Math.min(400, maxTextWidth); // Use smaller of 400 or available space
      
      // Always display school address if it exists
      if (schoolAddress && schoolAddress.trim()) {
        doc.fontSize(10).font('Helvetica').text(schoolAddress.trim(), textStartX, currentY, { 
          width: textWidth,
          align: 'left'
        });
        // Move down for phone (account for multi-line address)
        const addressHeight = doc.heightOfString(schoolAddress.trim(), { width: textWidth });
        currentY += addressHeight + 10;
      } else {
        // If no address, just move down a bit
        currentY = logoY + 25;
      }
      
      // Display school phone if it exists
      if (schoolPhone && schoolPhone.trim()) {
        doc.fontSize(10).font('Helvetica').text(`Phone: ${schoolPhone.trim()}`, textStartX, currentY, {
          width: textWidth,
          align: 'left'
        });
        // Move down for academic year (account for multi-line phone)
        const phoneHeight = doc.heightOfString(`Phone: ${schoolPhone.trim()}`, { width: textWidth });
        currentY += phoneHeight + 10;
      } else {
        // If no phone, add spacing before academic year
        currentY += 5;
      }
      
      // Display academic year
      doc.fontSize(10).text(`Academic Year: ${academicYear}`, textStartX, currentY);
      currentY += 15; // Add spacing after academic year

      // Title - adjust position based on logo size and header content with styled background
      // Ensure title is below all header content (logo, name, address, phone, academic year)
      const titleY = Math.max(currentY + 20, logoY + logoHeight + 20);
      const titleBoxHeight = 35; // Increased to accommodate multiple lines
      
      // Title background box - Blue color (fill only, no stroke to avoid lines near logos)
      doc.rect(50, titleY - 10, 500, titleBoxHeight)
        .fillColor('#4A90E2') // Standard blue
        .fill();
      
      // Get exam type and academic year for the title bar
      const examTypeText = reportCard.examType || reportCard.exam?.type || '';
      const titleText = `REPORT CARD${examTypeText ? ` - ${examTypeText.toUpperCase()}` : ''}`;
      
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#FFFFFF'); // Reduced from 16 to 14
      doc.text(titleText, 50, titleY, { align: 'center', width: 500 });
      
      // Add academic year below REPORT CARD
      if (academicYear) {
        doc.fontSize(9).font('Helvetica').fillColor('#FFFFFF'); // Reduced from 11 to 9
        doc.text(`Academic Year: ${academicYear}`, 50, titleY + 16, { align: 'center', width: 500 }); // Adjusted position
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
      
      // Add Class Position and Grade Position
      const totalStudents = reportCard.totalStudents || 0;
      const classPosText = totalStudents > 0 
        ? `Class Position: ${reportCard.classPosition} out of ${totalStudents}`
        : `Class Position: ${reportCard.classPosition}`;
      doc.text(classPosText, 310, examInfoY);
      examInfoY += 15;
      
      if (reportCard.formPosition && reportCard.formPosition > 0) {
        const totalStudentsPerStream = reportCard.totalStudentsPerStream || 0;
        const gradePosText = totalStudentsPerStream > 0
          ? `Grade Position: ${reportCard.formPosition} out of ${totalStudentsPerStream}`
          : `Grade Position: ${reportCard.formPosition}`;
        doc.text(gradePosText, 310, examInfoY);
        examInfoY += 15;
      }
      
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

      // Subjects Table - adjust position based on info section (reduced spacing for one page)
      let yPos = infoStartY + 100;
      doc.fontSize(10).font('Helvetica-Bold').text('Subject Performance:', 50, yPos);
      yPos += 16;

      // Define table dimensions - adjusted to prevent overlap
      const tableStartX = 50;
      const tableEndX = 545;
      const rowHeight = 18; // Reduced to fit more rows on one page
      const headerRowHeight = 26; // Increased to accommodate multi-line headers and descenders (g, p, y, etc.)
      const colWidths = {
        subject: 70,        // Reduced from 90
        subjectCode: 55,    // Reduced from 70
        markObtained: 50,   // Reduced from 75 to fit "Mark\nObtained" (two lines)
        possibleMark: 50,   // Reduced from 75 to fit "Possible\nMark" (two lines)
        classAverage: 45,   // Reduced from 55 to fit "Class\nAvg" (two lines)
        grade: 70,          // Reduced from 80 to give more space to comments
        comments: 210       // Increased from 200 to accommodate full comments without trimming
      };
      
      // Calculate total width and adjust if needed
      const totalTableWidth = colWidths.subject + colWidths.subjectCode + colWidths.markObtained + colWidths.possibleMark + 
                              colWidths.classAverage + colWidths.grade + colWidths.comments + 30; // 30 for padding
      const availableWidth = tableEndX - tableStartX;
      
      if (totalTableWidth > availableWidth) {
        // Calculate available space for comments (reserve space for other columns + padding)
        const reservedWidth = colWidths.subject + colWidths.subjectCode + colWidths.markObtained + colWidths.possibleMark + 
                              colWidths.classAverage + colWidths.grade + 30;
        colWidths.comments = Math.max(180, availableWidth - reservedWidth); // Minimum 180 for comments to prevent trimming
      }
      const colPositions = {
        subject: tableStartX + 5,
        subjectCode: tableStartX + colWidths.subject + 5,
        markObtained: tableStartX + colWidths.subject + colWidths.subjectCode + 5,
        possibleMark: tableStartX + colWidths.subject + colWidths.subjectCode + colWidths.markObtained + 5,
        classAverage: tableStartX + colWidths.subject + colWidths.subjectCode + colWidths.markObtained + colWidths.possibleMark + 5,
        grade: tableStartX + colWidths.subject + colWidths.subjectCode + colWidths.markObtained + colWidths.possibleMark + colWidths.classAverage + 5,
        comments: tableStartX + colWidths.subject + colWidths.subjectCode + colWidths.markObtained + colWidths.possibleMark + colWidths.classAverage + colWidths.grade + 5
      };

      // Table Header with background color
      const headerY = yPos;
      doc.rect(tableStartX, headerY, tableEndX - tableStartX, headerRowHeight)
        .fillColor('#4A90E2')
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
      doc.text('Comments', colPositions.comments, singleLineY, { width: colWidths.comments - 10, align: 'center' });
      
      // Multi-line headers - positioned to allow space for descenders (g in "Avg", p, y, etc.)
      // Start at headerY + 4 to give adequate top padding, leaving room at bottom for descenders
      const multiLineY = headerY + 4;
      doc.text('Subject\nCode', colPositions.subjectCode, multiLineY, { width: colWidths.subjectCode - 10, align: 'center' });
      doc.text('Mark\nObtained', colPositions.markObtained, multiLineY, { width: colWidths.markObtained - 5, align: 'center' });
      doc.text('Possible\nMark', colPositions.possibleMark, multiLineY, { width: colWidths.possibleMark - 5, align: 'center' });
      doc.text('Class\nAvg', colPositions.classAverage, multiLineY, { width: colWidths.classAverage - 10, align: 'center' });

      // Calculate column boundaries for proper alignment
      const colBoundaries = [
        tableStartX,
        tableStartX + colWidths.subject,
        tableStartX + colWidths.subject + colWidths.subjectCode,
        tableStartX + colWidths.subject + colWidths.subjectCode + colWidths.markObtained,
        tableStartX + colWidths.subject + colWidths.subjectCode + colWidths.markObtained + colWidths.possibleMark,
        tableStartX + colWidths.subject + colWidths.subjectCode + colWidths.markObtained + colWidths.possibleMark + colWidths.classAverage,
        tableStartX + colWidths.subject + colWidths.subjectCode + colWidths.markObtained + colWidths.possibleMark + colWidths.classAverage + colWidths.grade,
        tableEndX
      ];

      // Draw header borders
      doc.strokeColor('#000000').lineWidth(1);
      // Top border
      doc.moveTo(tableStartX, headerY).lineTo(tableEndX, headerY).stroke();
      // Bottom border
      doc.moveTo(tableStartX, headerY + headerRowHeight).lineTo(tableEndX, headerY + headerRowHeight).stroke();
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
        const commentsText = subject.comments || '-';
        
        // Calculate comments height BEFORE drawing row background
        const commentsWidth = colWidths.comments - 20;
        const commentsHeight = doc.heightOfString(commentsText, { width: commentsWidth });
        const minRowHeight = 18;
        const actualRowHeight = Math.max(minRowHeight, commentsHeight + 10);
        
        // Alternate row background color with calculated height
        if (isEvenRow) {
          doc.rect(tableStartX, rowY, tableEndX - tableStartX, actualRowHeight)
            .fillColor('#F8F9FA')
            .fill();
        } else {
          doc.rect(tableStartX, rowY, tableEndX - tableStartX, actualRowHeight)
            .fillColor('#FFFFFF')
            .fill();
        }

        // Draw cell borders using same column boundaries with calculated height
        doc.strokeColor('#CCCCCC').lineWidth(0.5);
        // Top border
        doc.moveTo(tableStartX, rowY).lineTo(tableEndX, rowY).stroke();
        // Bottom border
        doc.moveTo(tableStartX, rowY + actualRowHeight).lineTo(tableEndX, rowY + actualRowHeight).stroke();
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
        
        // Render comments with proper text wrapping - ensure NO trimming occurs
        // commentsWidth is already calculated above, reuse it here
        // Draw comments with full text wrapping - no ellipsis, no truncation
        doc.text(commentsText, colPositions.comments, rowY + 8, { 
          width: commentsWidth,
          align: 'left',
          ellipsis: false // Prevent ellipsis - ensure full text is displayed with wrapping
        });
        
        // Use the calculated actual row height for this row (already calculated before drawing)
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
      
      // Calculate dynamic height for remarks section
      const classTeacherRemarks = reportCard.remarks?.classTeacherRemarks || 'No remarks provided.';
      const headmasterRemarks = reportCard.remarks?.headmasterRemarks || 'No remarks provided.';
      
      // Get headmaster name from settings for height calculation
      const headmasterName = settings?.headmasterName || '';
      const signatureHeight = headmasterName ? 12 : 0;
      
      // Limit remarks height to fit on one page (more compact)
      const maxRemarksTextHeight = 22; // Maximum height for each remarks box (reduced)
      const teacherRemarksTextHeight = doc.heightOfString(classTeacherRemarks, { width: 480 });
      const headmasterRemarksTextHeight = doc.heightOfString(headmasterRemarks, { width: 480 });
      
      const teacherRemarksHeight = Math.min(maxRemarksTextHeight, Math.max(22, teacherRemarksTextHeight + 4));
      const headmasterRemarksHeight = Math.min(maxRemarksTextHeight, Math.max(22, headmasterRemarksTextHeight + 4)) + signatureHeight;
      
      // Calculate total remarks section height (proper spacing to prevent overlapping)
      const remarksTitleHeight = 24;
      const remarksBoxHeight = remarksTitleHeight + 18 + teacherRemarksHeight + 18 + headmasterRemarksHeight + 15;
      
      // Remarks title with styled box - full blue background
      const remarksBoxY = yPos;
      
      doc.rect(50, remarksBoxY, 500, remarksBoxHeight)
        .fillColor('#4A90E2') // Medium blue background
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

      // Headmaster/Principal Remarks - Always display
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF'); // Bold white text for label
      doc.text('Headmaster/Principal Remarks:', 60, yPos);
      yPos += 15; // Increased spacing before box
      
      // Calculate height needed for remarks + signature
      // headmasterName and signatureHeight are already declared above
      const totalHeadmasterBoxHeight = headmasterRemarksHeight;
      
      // White rectangular box for Headmaster/Principal Remarks (extended to include signature)
      doc.rect(60, yPos - 3, 480, totalHeadmasterBoxHeight)
        .fillColor('#FFFFFF')
        .fill()
        .strokeColor('#CCCCCC')
        .lineWidth(1)
        .stroke();
      
      doc.fontSize(8).font('Helvetica').fillColor('#000000'); // Black text for remarks content
      // Calculate available height for remarks (excluding signature space)
      const remarksOnlyHeight = headmasterRemarksHeight - signatureHeight;
      const availableRemarksHeight = Math.min(maxRemarksTextHeight, Math.max(22, headmasterRemarksTextHeight + 4));
      const headmasterRemarksToShow = headmasterRemarksTextHeight > availableRemarksHeight 
        ? headmasterRemarks.substring(0, Math.floor(headmasterRemarks.length * 0.8)) + '...'
        : headmasterRemarks;
      doc.text(headmasterRemarksToShow, 65, yPos, { width: 480 });
      
      // Add headmaster name as signature after remarks
      if (headmasterName) {
        const signatureY = yPos + remarksOnlyHeight - 2; // Position signature at bottom of remarks text area
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000'); // Bold black for signature
        // Position signature with left padding (move left by approximately 3 spaces)
        // Calculate right-aligned position then subtract space for 3 characters
        const signatureWidth = doc.widthOfString(headmasterName);
        const rightAlignedX = 65 + 480 - signatureWidth; // Right-aligned position
        const leftOffset = doc.widthOfString('   '); // Width of 3 spaces
        const signatureX = Math.max(65, rightAlignedX - leftOffset); // Move left by 3 spaces, but don't go past left margin
        doc.text(headmasterName, signatureX, signatureY, { width: 480 - (signatureX - 65) }); // Left-aligned from adjusted position
      }
      
      yPos += totalHeadmasterBoxHeight + 10; // Increased spacing after headmaster remarks

      // Grade Scale Footer Section
      yPos += 20; // Add spacing after remarks
      
      // Get page height for calculations
      const pageHeight = doc.page.height;
      
      // Check if we need a new page for grade scale
      const gradeScaleHeight = 120; // Estimated height for grade scale section
      if (yPos + gradeScaleHeight > pageHeight - 50) {
        doc.addPage();
        yPos = 50;
      }

      // Grade Scale Title
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#003366');
      doc.text('Grade Scale / Attainment Levels', 50, yPos, { align: 'center', width: 500 });
      yPos += 15;

      // Grade Scale Box
      const gradeScaleBoxY = yPos;
      const gradeScaleBoxHeight = 80;
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

      // Calculate positions for grid layout (2 rows: 4 items in first row, 3 items in second row)
      const itemWidth = 115; // Width for each item
      const startX = 60;
      const startY = gradeScaleBoxY + 10;
      const rowGap = 35;
      const colGap = 20;

      gradeItems.forEach((item, index) => {
        let row = Math.floor(index / 4);
        let col = index % 4;
        
        // Adjust for last row (only 3 items) - center them
        if (row === 1 && col >= 3) {
          col = col - 1;
        }
        
        // Center the last row items
        let xPos;
        if (row === 1) {
          // Last row: center the 3 items
          const lastRowStartX = startX + (itemWidth + colGap) * 0.5;
          xPos = lastRowStartX + col * (itemWidth + colGap);
        } else {
          // First row: normal positioning
          xPos = startX + col * (itemWidth + colGap);
        }

        const yPosItem = startY + row * rowGap;

        // Range
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#003366');
        doc.text(item.range, xPos, yPosItem, { width: itemWidth });
        
        // Label
        doc.fontSize(7).font('Helvetica').fillColor('#495057');
        doc.text(item.label, xPos, yPosItem + 12, { width: itemWidth });
      });

      // Footer - Position at bottom of page
      const footerY = pageHeight - 25; // Position footer 25pt from bottom
      doc.fontSize(7).font('Helvetica').fillColor('#000000').text(
        `Generated on: ${new Date(reportCard.generatedAt).toLocaleString()}`,
        50,
        footerY,
        { align: 'center', width: 500 }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

