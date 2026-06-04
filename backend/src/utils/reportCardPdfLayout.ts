import PDFDocument from 'pdfkit';
import { Settings } from '../entities/Settings';
import { decodeSchoolLogoBuffer, getReportCardSecondaryLogo } from './reportCardSchoolLogo';

type PdfDoc = InstanceType<typeof PDFDocument>;

export interface ReportCardPdfSubject {
  subject: string;
  subjectCode?: string;
  score: number;
  maxScore: number;
  percentage: string;
  classAverage?: number;
  grade?: string;
}

export interface ReportCardPdfInput {
  student: {
    name: string;
    studentNumber: string;
    class?: string;
  };
  examType?: string;
  exams?: Array<{ name: string }>;
  subjects: ReportCardPdfSubject[];
  overallAverage: string | number;
  overallGrade?: string;
  classPosition?: number;
  totalStudents?: number;
  totalAttendance?: number;
  presentAttendance?: number;
  remarks?: {
    classTeacherRemarks?: string | null;
    headmasterRemarks?: string | null;
  };
  generatedAt: Date;
}

const NAVY = '#1e3a8a';
const NAVY_SIDE = '#1e40af';
const BLUE_BAR = '#2563eb';
const TABLE_HEADER = '#1e40af';
const HEADER_LABEL = '#bfdbfe';
const META_BLUE = '#93c5fd';
const GOLD = '#f59e0b';
const BORDER = '#e2e8f0';
const ROW_ALT = '#f0f9ff';
const LABEL_SLATE = '#64748b';
const VALUE_DARK = '#1e293b';
const REMARKS_BG = '#f8fafc';

function isEcdAOrBClass(className: string | undefined | null): boolean {
  const raw = (className || '').toString().trim();
  return /\bECD\s*A\b/i.test(raw) || /\bECD\s*B\b/i.test(raw);
}

function schoolInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (name.slice(0, 3) || 'SCH').toUpperCase();
}

function examTypeLabel(examType: string): string {
  if (examType === 'mid_term') return 'Mid Term';
  if (examType === 'end_term') return 'End of Term';
  return examType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Mark Obtained, % Score, and Grade: blue bold only */
const SCORE_BLUE = '#2563eb';
const GRADE_PILL_BLUE = { bg: '#dbeafe', text: SCORE_BLUE };

function gradePillColors(_grade: string): { bg: string; text: string } {
  return GRADE_PILL_BLUE;
}

function markScoreColor(_score: number): string {
  return SCORE_BLUE;
}

function subjectPercentScore(score: number, maxScore: number, isNa: boolean): number | null {
  if (isNa || maxScore <= 0) return null;
  return Math.round((score / maxScore) * 100);
}

/** Fixed column widths (px) — total 670px; do not squeeze below these. */
const TABLE_COL_WIDTHS_PX = [160, 60, 90, 90, 80, 80, 110] as const;
const TABLE_TOTAL_WIDTH_PX = TABLE_COL_WIDTHS_PX.reduce((a, b) => a + b, 0);
const SUBJECT_COL_MIN_PX = 140;
const CODE_COL_MIN_PX = 55;
const GRADE_PILL_MIN_PX = 90;

const TABLE_HEADERS = [
  'Subject',
  'Code',
  'Mark Obtained',
  'Possible Mark',
  'Class Avg',
  '% Score',
  'Grade'
] as const;

const CELL_PAD = 10;
const SECTION_RADIUS = 8;
const INFO_LABEL_H = 11;

export interface ReportCardLayoutMetrics {
  bannerH: number;
  tableRowMinH: number;
  tableHeaderH: number;
  sectionBarH: number;
  summaryH: number;
  infoRowMaxH: number;
  remarkBlockGap: number;
  remarkLabelH: number;
  remarkMinBoxH: number;
  remarkMaxTextH: number;
  remarkPadY: number;
  cardBottomPad: number;
}

export function resolveLayoutMetrics(
  subjectCount: number,
  remarksCharCount: number
): ReportCardLayoutMetrics {
  const longRemarks = remarksCharCount > 280;
  if (subjectCount >= 14 || (subjectCount >= 10 && longRemarks)) {
    return {
      bannerH: 54,
      tableRowMinH: 24,
      tableHeaderH: 28,
      sectionBarH: 18,
      summaryH: 38,
      infoRowMaxH: 32,
      remarkBlockGap: 5,
      remarkLabelH: 10,
      remarkMinBoxH: 26,
      remarkMaxTextH: 28,
      remarkPadY: 8,
      cardBottomPad: 4
    };
  }
  if (subjectCount >= 10 || longRemarks) {
    return {
      bannerH: 60,
      tableRowMinH: 28,
      tableHeaderH: 30,
      sectionBarH: 20,
      summaryH: 42,
      infoRowMaxH: 36,
      remarkBlockGap: 6,
      remarkLabelH: 11,
      remarkMinBoxH: 30,
      remarkMaxTextH: 40,
      remarkPadY: 8,
      cardBottomPad: 4
    };
  }
  return {
    bannerH: 68,
    tableRowMinH: 36,
    tableHeaderH: 36,
    sectionBarH: 22,
    summaryH: 48,
    infoRowMaxH: 40,
    remarkBlockGap: 8,
    remarkLabelH: 12,
    remarkMinBoxH: 40,
    remarkMaxTextH: 56,
    remarkPadY: 10,
    cardBottomPad: 6
  };
}

function getTableColWidths(innerW: number): number[] {
  const colWidths: number[] = TABLE_COL_WIDTHS_PX.map((w) => w);
  colWidths[1] = Math.max(CODE_COL_MIN_PX, colWidths[1]);
  const extraTableW = Math.max(0, innerW - TABLE_TOTAL_WIDTH_PX);
  colWidths[0] = Math.max(SUBJECT_COL_MIN_PX, colWidths[0] + extraTableW);
  return colWidths;
}

function remarksCharCount(reportCard: ReportCardPdfInput): number {
  const ct = reportCard.remarks?.classTeacherRemarks?.trim() || '';
  const hm = reportCard.remarks?.headmasterRemarks?.trim() || '';
  return ct.length + hm.length;
}

function fillTopRoundedRect(
  doc: PdfDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string
) {
  doc.save();
  doc.moveTo(x + r, y);
  doc.lineTo(x + w - r, y);
  doc.quadraticCurveTo(x + w, y, x + w, y + r);
  doc.lineTo(x + w, y + h);
  doc.lineTo(x, y + h);
  doc.lineTo(x, y + r);
  doc.quadraticCurveTo(x, y, x + r, y);
  doc.closePath().fillColor(color).fill();
  doc.restore();
}

function fillBottomRoundedRect(
  doc: PdfDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string
) {
  doc.save();
  doc.moveTo(x, y);
  doc.lineTo(x + w, y);
  doc.lineTo(x + w, y + h - r);
  doc.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  doc.lineTo(x + r, y + h);
  doc.quadraticCurveTo(x, y + h, x, y + h - r);
  doc.closePath().fillColor(color).fill();
  doc.restore();
}

function buildGradeGetter(settings: Settings | null) {
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
  return (percentage: number): string => {
    if (percentage === 0) return gradeLabels.fail || 'UNCLASSIFIED';
    if (percentage >= (thresholds.excellent || 90)) return gradeLabels.excellent || 'OUTSTANDING';
    if (percentage >= (thresholds.veryGood || 80)) return gradeLabels.veryGood || 'VERY HIGH';
    if (percentage >= (thresholds.good || 60)) return gradeLabels.good || 'HIGH';
    if (percentage >= (thresholds.satisfactory || 40)) return gradeLabels.satisfactory || 'GOOD';
    if (percentage >= (thresholds.needsImprovement || 20)) return gradeLabels.needsImprovement || 'ASPIRING';
    if (percentage >= (thresholds.basic || 1)) return gradeLabels.basic || 'BASIC';
    return gradeLabels.fail || 'UNCLASSIFIED';
  };
}

function drawHLine(doc: PdfDoc, x: number, y: number, w: number) {
  doc.save();
  doc.strokeColor(BORDER).lineWidth(0.5);
  doc.moveTo(x, y).lineTo(x + w, y).stroke();
  doc.restore();
}

function drawVLine(doc: PdfDoc, x: number, y: number, h: number) {
  doc.save();
  doc.strokeColor(BORDER).lineWidth(0.5);
  doc.moveTo(x, y).lineTo(x, y + h).stroke();
  doc.restore();
}

/** Single-line table header (no wrap). */
function drawTableHeaderLabel(
  doc: PdfDoc,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  align: 'left' | 'center' = 'center'
) {
  const upper = label.toUpperCase();
  const textW = Math.max(10, w - CELL_PAD * 2);
  doc.fontSize(11).font('Helvetica-Bold').fillColor(HEADER_LABEL);
  const lineH = doc.currentLineHeight(true) || 11;
  doc.text(upper, x + CELL_PAD, y + (h - lineH) / 2, {
    width: textW,
    align,
    lineBreak: false,
    characterSpacing: 0.44
  });
}

function drawGradePill(
  doc: PdfDoc,
  grade: string,
  x: number,
  y: number,
  colW: number,
  rowH: number
) {
  const colors = gradePillColors(grade);
  const text = grade || '—';
  doc.fontSize(11).font('Helvetica-Bold');
  const textW = doc.widthOfString(text) + 24;
  const tw = Math.max(GRADE_PILL_MIN_PX, Math.min(textW, colW - CELL_PAD * 2));
  const ph = 18;
  const px = x + (colW - tw) / 2;
  const py = y + (rowH - ph) / 2;
  doc.save();
  doc.roundedRect(px, py, tw, ph, 4).fillColor(colors.bg).fill();
  doc.fillColor(colors.text).text(text, px, py + 4, { width: tw, align: 'center', lineBreak: false });
  doc.restore();
}

function drawColoredMark(
  doc: PdfDoc,
  text: string,
  score: number,
  x: number,
  y: number,
  colW: number,
  rowH: number,
  isNa: boolean
) {
  const color = isNa ? SCORE_BLUE : markScoreColor(score);
  doc.fontSize(13).font('Helvetica-Bold').fillColor(color);
  const lineH = doc.currentLineHeight(true) || 13;
  doc.text(text, x + CELL_PAD, y + (rowH - lineH) / 2, {
    width: colW - CELL_PAD * 2,
    align: 'center',
    lineBreak: false
  });
}

/** Single-line cell (all columns except Subject body). */
function drawNowrapCell(
  doc: PdfDoc,
  text: string,
  x: number,
  y: number,
  colW: number,
  rowH: number,
  align: 'left' | 'center' = 'center'
) {
  doc.fontSize(11).font('Helvetica').fillColor(VALUE_DARK);
  const lineH = doc.currentLineHeight(true) || 11;
  doc.text(text, x + CELL_PAD, y + (rowH - lineH) / 2, {
    width: colW - CELL_PAD * 2,
    align,
    lineBreak: false
  });
}

/** Subject body cell — may wrap; column never narrower than 140px. */
function drawSubjectCell(
  doc: PdfDoc,
  text: string,
  x: number,
  y: number,
  colW: number,
  rowH: number
) {
  const effectiveW = Math.max(SUBJECT_COL_MIN_PX, colW);
  doc.fontSize(11).font('Helvetica').fillColor(VALUE_DARK);
  doc.text(text, x + CELL_PAD, y + CELL_PAD, {
    width: effectiveW - CELL_PAD * 2,
    height: Math.max(8, rowH - CELL_PAD * 2),
    align: 'left',
    lineGap: 2,
    ellipsis: true
  });
}

function measureSubjectRowHeight(
  doc: PdfDoc,
  subjectName: string,
  subjectColW: number,
  minRowH: number
): number {
  const effectiveW = Math.max(SUBJECT_COL_MIN_PX, subjectColW);
  doc.fontSize(11).font('Helvetica');
  const textH = doc.heightOfString(subjectName, {
    width: effectiveW - CELL_PAD * 2,
    lineGap: 2
  });
  return Math.max(minRowH, Math.ceil(textH) + CELL_PAD * 2);
}

function drawBannerSchoolLogo(
  doc: PdfDoc,
  innerX: number,
  y: number,
  bannerH: number,
  sideW: number,
  settings: Settings | null,
  initials: string
): void {
  const logoBox = Math.min(sideW - 12, bannerH - 12, 48);
  const logoX = innerX + (sideW - logoBox) / 2;
  const logoY = y + (bannerH - logoBox) / 2;
  const raw = getReportCardSecondaryLogo(settings);
  const buffer = raw ? decodeSchoolLogoBuffer(raw) : null;

  if (buffer) {
    try {
      doc.save();
      doc.roundedRect(logoX, logoY, logoBox, logoBox, 6).fillColor('#ffffff').fill();
      doc.image(buffer, logoX + 2, logoY + 2, {
        fit: [logoBox - 4, logoBox - 4],
        align: 'center',
        valign: 'center'
      });
      doc.restore();
      return;
    } catch {
      try {
        doc.restore();
      } catch {
        /* ignore */
      }
    }
  }

  const logoR = 26;
  const logoCx = innerX + sideW / 2;
  const logoCy = y + bannerH / 2;
  doc.circle(logoCx, logoCy, logoR).fillColor('#ffffff').fill();
  doc.fontSize(14).font('Helvetica-Bold').fillColor(NAVY);
  doc.text(initials, logoCx - logoR, logoCy - 7, { width: logoR * 2, align: 'center' });
}

function drawGoldPill(doc: PdfDoc, text: string, centerX: number, y: number, maxWidth: number) {
  doc.fontSize(11).font('Helvetica-Bold');
  const tw = Math.min(doc.widthOfString(text) + 20, maxWidth);
  const px = centerX - tw / 2;
  doc.save();
  doc.roundedRect(px, y, tw, 16, 8).fillColor(GOLD).fill();
  doc.fillColor('#ffffff').text(text, px, y + 3, { width: tw, align: 'center' });
  doc.restore();
}

export function estimateReportCardHeight(
  doc: PdfDoc,
  reportCard: ReportCardPdfInput,
  innerW: number
): number {
  const metrics = resolveLayoutMetrics(reportCard.subjects.length, remarksCharCount(reportCard));
  const colWidths = getTableColWidths(innerW);
  let h = metrics.bannerH;

  const infoFields: Array<{ value: string }> = [
    { value: reportCard.student.name },
    { value: reportCard.examType || '' },
    { value: reportCard.student.studentNumber },
    { value: '' },
    { value: reportCard.student.class || '' },
    { value: '' }
  ];
  const colW = innerW / 2;
  const infoPadX = 10;
  for (let row = 0; row < 3; row++) {
    let maxRowH = 32;
    for (let col = 0; col < 2; col++) {
      const idx = row * 2 + col;
      doc.fontSize(10).font('Helvetica');
      const valueH = doc.heightOfString(infoFields[idx].value, {
        width: colW - infoPadX * 2,
        lineGap: 1
      });
      maxRowH = Math.max(maxRowH, INFO_LABEL_H + valueH + 10);
    }
    h += Math.min(maxRowH, metrics.infoRowMaxH);
  }

  h += metrics.sectionBarH + metrics.tableHeaderH;
  for (const subject of reportCard.subjects) {
    h += measureSubjectRowHeight(doc, subject.subject, colWidths[0], metrics.tableRowMinH);
  }
  h += metrics.summaryH;

  const remarkTextWidth = innerW - 20 - 8;
  const classTeacherRemarks =
    reportCard.remarks?.classTeacherRemarks?.trim() || 'No remarks provided.';
  const headRemarks =
    reportCard.remarks?.headmasterRemarks?.trim() || 'No head\'s remarks entered.';
  doc.fontSize(10).font('Helvetica');
  for (const text of [classTeacherRemarks, headRemarks]) {
    h += metrics.remarkBlockGap + metrics.remarkLabelH;
    const textH = Math.min(
      doc.heightOfString(text, { width: remarkTextWidth, lineGap: 3 }),
      metrics.remarkMaxTextH
    );
    h += Math.max(metrics.remarkMinBoxH, textH + metrics.remarkPadY * 2) + 2;
  }

  return h + metrics.cardBottomPad;
}

export interface ReportCardLayoutOptions {
  cardX?: number;
  cardY?: number;
  cardW?: number;
}

export function renderReportCardLayout(
  doc: PdfDoc,
  reportCard: ReportCardPdfInput,
  settings: Settings | null,
  options?: ReportCardLayoutOptions
): number {
  const getGrade = buildGradeGetter(settings);
  const schoolName = settings?.schoolName || 'School Management System';
  const schoolAddress = settings?.schoolAddress ? String(settings.schoolAddress).trim() : '';
  const schoolPhone = settings?.schoolPhone ? String(settings.schoolPhone).trim() : '';
  const academicYear = settings?.academicYear || new Date().getFullYear().toString();
  const initials = schoolInitials(schoolName);

  const margin = 20;
  const cardX = options?.cardX ?? margin;
  const cardW = options?.cardW ?? doc.page.width - margin * 2;
  const cardStartY = options?.cardY ?? margin;
  let y = cardStartY;

  const innerX = cardX;
  const innerW = cardW;

  const metrics = resolveLayoutMetrics(reportCard.subjects.length, remarksCharCount(reportCard));
  const bannerH = metrics.bannerH;
  const sideW = 72;
  const centerW = innerW - sideW * 2;

  doc.rect(innerX, y, sideW, bannerH).fillColor(NAVY_SIDE).fill();
  doc.rect(innerX + sideW, y, centerW, bannerH).fillColor(NAVY).fill();
  doc.rect(innerX + sideW + centerW, y, sideW, bannerH).fillColor(NAVY_SIDE).fill();

  drawBannerSchoolLogo(doc, innerX, y, bannerH, sideW, settings, initials);

  const centerX = innerX + sideW;
  doc.fontSize(16).font('Helvetica').fillColor('#ffffff');
  doc.text(schoolName, centerX, y + 12, { width: centerW, align: 'center' });
  const metaParts = [schoolAddress, schoolPhone ? `Tel: ${schoolPhone}` : ''].filter(Boolean);
  if (metaParts.length) {
    doc.fontSize(10).fillColor(META_BLUE);
    doc.text(metaParts.join('  •  '), centerX, y + 32, { width: centerW, align: 'center' });
  }
  const examLabel = examTypeLabel(reportCard.examType || '');
  drawGoldPill(doc, `Report Card — ${examLabel}`, centerX + centerW / 2, y + 42, centerW - 16);

  const rightX = innerX + sideW + centerW;
  doc.fontSize(10).fillColor(META_BLUE);
  doc.text('Academic Year', rightX, y + 22, { width: sideW, align: 'center' });
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#ffffff');
  doc.text(academicYear, rightX, y + 36, { width: sideW, align: 'center' });

  y += bannerH;

  const examDisplay =
    reportCard.exams && reportCard.exams.length > 0
      ? Array.from(new Set(reportCard.exams.map((e) => e.name))).join(', ')
      : examLabel;

  let positionText = '—';
  if (!isEcdAOrBClass(reportCard.student.class)) {
    const pos = reportCard.classPosition || 0;
    const total = reportCard.totalStudents || 0;
    positionText = total > 0 ? `${pos} / ${total}` : String(pos || '—');
  }

  let attendanceText = '—';
  if (reportCard.totalAttendance != null) {
    attendanceText = `${reportCard.totalAttendance} day${reportCard.totalAttendance !== 1 ? 's' : ''}`;
    if (reportCard.presentAttendance != null) {
      attendanceText += ` (${reportCard.presentAttendance} present)`;
    }
  }

  const infoFields: Array<{ label: string; value: string }> = [
    { label: 'Student Name', value: reportCard.student.name },
    { label: 'Exam', value: examDisplay },
    { label: 'Student Number', value: reportCard.student.studentNumber },
    { label: 'Class Position', value: positionText },
    { label: 'Class', value: reportCard.student.class || '' },
    { label: 'Attendance', value: attendanceText }
  ];

  const colW = innerW / 2;
  const infoPadX = 10;
  const infoRowHeights: number[] = [];
  for (let row = 0; row < 3; row++) {
    let maxRowH = 32;
    for (let col = 0; col < 2; col++) {
      const idx = row * 2 + col;
      doc.fontSize(10).font('Helvetica').fillColor(VALUE_DARK);
      const valueH = doc.heightOfString(infoFields[idx].value, {
        width: colW - infoPadX * 2,
        lineGap: 1
      });
      maxRowH = Math.max(maxRowH, INFO_LABEL_H + valueH + 10);
    }
    infoRowHeights.push(Math.min(maxRowH, metrics.infoRowMaxH));
  }
  let infoY = y;
  for (let row = 0; row < 3; row++) {
    const infoRowH = infoRowHeights[row];
    for (let col = 0; col < 2; col++) {
      const idx = row * 2 + col;
      const cellX = innerX + col * colW;
      const cellY = infoY;
      if (col === 0) {
        drawVLine(doc, cellX + colW, cellY, infoRowH);
      }
      drawHLine(doc, innerX, cellY + infoRowH, innerW);
      doc.fontSize(8).font('Helvetica').fillColor(LABEL_SLATE);
      doc.text(infoFields[idx].label.toUpperCase(), cellX + infoPadX, cellY + 6, {
        width: colW - infoPadX * 2,
        characterSpacing: 0.4,
        lineGap: 0,
        lineBreak: false
      });
      doc.fontSize(10).font('Helvetica').fillColor(VALUE_DARK);
      const valueMaxH = Math.max(8, infoRowH - INFO_LABEL_H - 12);
      doc.text(infoFields[idx].value, cellX + infoPadX, cellY + INFO_LABEL_H + 6, {
        width: colW - infoPadX * 2,
        height: valueMaxH,
        lineGap: 1,
        ellipsis: true
      });
    }
    infoY += infoRowH;
  }
  y = infoY;

  const sectionBarH = metrics.sectionBarH;
  const tableBlockStartY = y;
  fillTopRoundedRect(doc, innerX, y, innerW, sectionBarH, SECTION_RADIUS, BLUE_BAR);
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#ffffff');
  doc.text('SUBJECT PERFORMANCE', innerX + CELL_PAD, y + 7, {
    width: innerW - CELL_PAD * 2,
    characterSpacing: 0.5,
    lineBreak: false
  });
  y += sectionBarH;

  const colWidths = getTableColWidths(innerW);
  const tableX = innerX;
  const tableTotalW = colWidths.reduce((a, b) => a + b, 0);
  const tableHeaderH = metrics.tableHeaderH;

  doc.rect(tableX, y, tableTotalW, tableHeaderH).fillColor(TABLE_HEADER).fill();
  let colX = tableX;
  TABLE_HEADERS.forEach((label, i) => {
    drawTableHeaderLabel(
      doc,
      label,
      colX,
      y,
      colWidths[i],
      tableHeaderH,
      i === 0 ? 'left' : 'center'
    );
    colX += colWidths[i];
  });
  drawHLine(doc, tableX, y + tableHeaderH, tableTotalW);
  colX = tableX;
  for (let i = 0; i < colWidths.length; i++) {
    if (i > 0) drawVLine(doc, colX, y, tableHeaderH);
    colX += colWidths[i];
  }
  y += tableHeaderH;

  reportCard.subjects.forEach((subject, index) => {
    const pct = parseFloat(String(subject.percentage || 0));
    const isNa = subject.grade === 'N/A';
    const grade =
      subject.grade && subject.grade !== 'N/A' ? subject.grade : isNa ? 'N/A' : getGrade(pct);
    const scoreNum = Math.round(subject.score);
    const maxNum = Math.round(subject.maxScore || 100);
    const scoreText = isNa ? 'N/A' : String(scoreNum);
    const maxText = isNa ? 'N/A' : String(maxNum);
    const avgText =
      subject.classAverage != null && !isNa ? String(Math.round(subject.classAverage)) : 'N/A';
    const pctVal = subjectPercentScore(scoreNum, maxNum, isNa);
    const pctText = pctVal == null ? 'N/A' : `${pctVal}%`;
    const pctForColor = pctVal ?? 0;

    const rowH = measureSubjectRowHeight(doc, subject.subject, colWidths[0], metrics.tableRowMinH);

    if (index % 2 === 1) {
      doc.rect(tableX, y, tableTotalW, rowH).fillColor(ROW_ALT).fill();
    }

    colX = tableX;
    drawSubjectCell(doc, subject.subject, colX, y, colWidths[0], rowH);
    colX += colWidths[0];

    drawNowrapCell(doc, subject.subjectCode || '—', colX, y, colWidths[1], rowH, 'center');
    colX += colWidths[1];

    drawColoredMark(doc, scoreText, isNa ? 0 : scoreNum, colX, y, colWidths[2], rowH, isNa);
    colX += colWidths[2];

    drawNowrapCell(doc, maxText, colX, y, colWidths[3], rowH, 'center');
    colX += colWidths[3];

    drawNowrapCell(doc, avgText, colX, y, colWidths[4], rowH, 'center');
    colX += colWidths[4];

    drawColoredMark(doc, pctText, pctForColor, colX, y, colWidths[5], rowH, isNa);
    colX += colWidths[5];

    drawGradePill(doc, grade, colX, y, colWidths[6], rowH);

    drawHLine(doc, tableX, y + rowH, tableTotalW);
    colX = tableX;
    for (let i = 0; i < colWidths.length; i++) {
      if (i > 0) drawVLine(doc, colX, y, rowH);
      colX += colWidths[i];
    }
    y += rowH;
  });

  const summaryH = metrics.summaryH;
  const summaryColW = innerW / 3;
  const overallPct = parseFloat(String(reportCard.overallAverage));
  const overallGrade = reportCard.overallGrade || getGrade(overallPct);

  fillBottomRoundedRect(doc, innerX, y, innerW, summaryH, SECTION_RADIUS, '#ffffff');
  drawHLine(doc, innerX, y, innerW);
  const summaryVals = [
    `${Number.isFinite(overallPct) ? overallPct.toFixed(2) : '0'}%`,
    overallGrade,
    positionText
  ];
  for (let i = 0; i < 3; i++) {
    const sx = innerX + i * summaryColW;
    if (i < 2) drawVLine(doc, sx + summaryColW, y, summaryH);
    doc.fontSize(10).font('Helvetica').fillColor(LABEL_SLATE);
    const labels = ['Overall Average', 'Overall Grade', 'Position'];
    doc.text(labels[i].toUpperCase(), sx, y + 12, {
      width: summaryColW,
      align: 'center',
      characterSpacing: 0.4
    });
    const summaryColor = i === 2 ? VALUE_DARK : SCORE_BLUE;
    doc.fontSize(15).font(i === 2 ? 'Helvetica' : 'Helvetica-Bold').fillColor(summaryColor);
    doc.text(summaryVals[i], sx, y + 30, { width: summaryColW, align: 'center', lineBreak: false });
  }
  y += summaryH;
  doc.strokeColor(BORDER).lineWidth(0.5);
  doc.roundedRect(innerX, tableBlockStartY, innerW, y - tableBlockStartY, SECTION_RADIUS).stroke();

  const classTeacherRemarks =
    reportCard.remarks?.classTeacherRemarks?.trim() || 'No remarks provided.';
  const headRemarks =
    reportCard.remarks?.headmasterRemarks?.trim() || 'No head\'s remarks entered.';

  const remarkPadX = 10;
  const remarkTextWidth = innerW - remarkPadX * 2 - 8;

  const drawRemarkBlock = (label: string, text: string) => {
    y += metrics.remarkBlockGap;
    doc.fontSize(8).font('Helvetica-Bold').fillColor(LABEL_SLATE);
    doc.text(label.toUpperCase(), innerX + remarkPadX, y, { lineGap: 0, lineBreak: false });
    y += metrics.remarkLabelH;
    doc.fontSize(10).font('Helvetica');
    const rawTextH = doc.heightOfString(text, { width: remarkTextWidth, lineGap: 3 });
    const textH = Math.min(rawTextH, metrics.remarkMaxTextH);
    const boxH = Math.max(metrics.remarkMinBoxH, textH + metrics.remarkPadY * 2);
    doc.roundedRect(innerX + 8, y, innerW - 16, boxH, 6)
      .fillColor(REMARKS_BG)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .fillAndStroke();
    doc.fillColor(VALUE_DARK).text(text, innerX + remarkPadX + 4, y + metrics.remarkPadY, {
      width: remarkTextWidth,
      height: Math.max(8, boxH - metrics.remarkPadY * 2),
      lineGap: 3,
      align: 'left',
      ellipsis: true
    });
    y += boxH + 2;
  };

  drawRemarkBlock('Class Teacher Remarks', classTeacherRemarks);
  drawRemarkBlock("Head's Remarks", headRemarks);

  const cardHeight = y - cardStartY + metrics.cardBottomPad;
  doc.save();
  doc.roundedRect(cardX, cardStartY, cardW, cardHeight, 10)
    .strokeColor(BORDER)
    .lineWidth(0.5)
    .stroke();
  doc.restore();

  return y;
}
