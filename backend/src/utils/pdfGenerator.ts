import PDFDocument from 'pdfkit';
import { Settings } from '../entities/Settings';
import {
  estimateReportCardHeight,
  renderReportCardLayout
} from './reportCardPdfLayout';

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
      const margin = 20;
      const footerReserve = 16;
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 0,
        autoFirstPage: true
      });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const innerW = pageW - margin * 2;
      const pageBudget = pageH - margin * 2 - footerReserve;

      const estimatedH = estimateReportCardHeight(doc, reportCard, innerW);
      const scale =
        estimatedH > pageBudget ? (pageBudget * 0.98) / estimatedH : 1;

      doc.save();
      doc.translate(margin, margin);
      if (scale < 1) {
        doc.scale(scale);
      }
      renderReportCardLayout(doc, reportCard, settings, {
        cardX: 0,
        cardY: 0,
        cardW: innerW
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
