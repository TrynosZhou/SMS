import PDFDocument from 'pdfkit';
import { Settings } from '../entities/Settings';
import { renderReportCardLayout } from './reportCardPdfLayout';

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

/** Match typical printed report cards — content fills ~78% of portrait A4 height. */
const PORTRAIT_TARGET_FILL = 0.78;
const MIN_PRE_REMARKS_GAP = 56;

function scaleForA4Portrait(contentHeight: number, pageBudget: number): number {
  if (contentHeight <= 0 || contentHeight <= pageBudget) {
    return 1;
  }
  return (pageBudget * 0.97) / contentHeight;
}

function computePreRemarksGap(baseHeight: number, pageBudget: number): number {
  if (baseHeight >= pageBudget) {
    return 0;
  }
  const targetHeight = pageBudget * PORTRAIT_TARGET_FILL;
  return Math.max(MIN_PRE_REMARKS_GAP, targetHeight - baseHeight);
}

export function createReportCardPDF(
  reportCard: ReportCardData,
  settings: Settings | null
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const margin = 24;
      const footerReserve = 18;
      const pageW = 595.28;
      const pageH = 841.89;
      const innerW = pageW - margin * 2;
      const pageBudget = pageH - margin * 2 - footerReserve;

      const measureDoc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margin: 0,
        autoFirstPage: true
      });
      measureDoc.on('data', () => {});
      measureDoc.on('error', reject);
      measureDoc.translate(margin, margin);
      const baseContentHeight = renderReportCardLayout(measureDoc, reportCard, settings, {
        cardX: 0,
        cardY: 0,
        cardW: innerW
      });
      measureDoc.end();

      const preRemarksGap = computePreRemarksGap(baseContentHeight, pageBudget);
      const contentHeight = baseContentHeight + preRemarksGap;
      const scale = scaleForA4Portrait(contentHeight, pageBudget);

      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margin: 0,
        autoFirstPage: true
      });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      doc.save();
      doc.translate(margin, margin);
      if (scale < 1) {
        doc.scale(scale);
      }
      renderReportCardLayout(doc, reportCard, settings, {
        cardX: 0,
        cardY: 0,
        cardW: innerW,
        preRemarksGap: scale < 1 ? 0 : preRemarksGap
      });
      doc.restore();

      const genDate = new Date(reportCard.generatedAt);
      const pad = (n: number) => String(n).padStart(2, '0');
      const formatted = `${pad(genDate.getDate())}/${pad(genDate.getMonth() + 1)}/${genDate.getFullYear()}, ${pad(genDate.getHours())}:${pad(genDate.getMinutes())}`;

      const docAny = doc as InstanceType<typeof PDFDocument> & { switchToPage?: (n: number) => void };
      if (typeof docAny.switchToPage === 'function') {
        try {
          docAny.switchToPage(0);
        } catch {
          /* single page */
        }
      }

      doc.fontSize(7).font('Helvetica').fillColor('#64748b').text(
        `Generated on: ${formatted}`,
        margin,
        pageH - margin - 8,
        { align: 'center', width: pageW - margin * 2, lineBreak: false }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
