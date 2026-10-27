import { Response } from 'express';
import { In } from 'typeorm';
import axios from 'axios';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { Exam, ExamStatus, ExamType } from '../entities/Exam';
import { Marks } from '../entities/Marks';
import { Student } from '../entities/Student';
import { ParentStudent } from '../entities/ParentStudent';
import { Parent } from '../entities/Parent';
import { ReportCardView } from '../entities/ReportCardView';
import { Settings } from '../entities/Settings';
import { sendWhatsAppMessage, sendWhatsAppDocument, buildWhatsAppWebUrl, normalizeWhatsAppRecipient, isWhatsAppConfigured } from '../utils/whatsappService';

// Simple in-memory cache for PDF previews to avoid regenerating the same report card
interface CacheEntry {
  buffer: Buffer;
  timestamp: number;
}
const pdfPreviewCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Periodic cache cleanup to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pdfPreviewCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      pdfPreviewCache.delete(key);
    }
  }
}, 60 * 1000); // Clean up every minute

/** Human-friendly label for an exam type, used in WhatsApp messages. */
function examTypeLabel(type: string | ExamType): string {
  const t = String(type || '').toLowerCase();
  if (t === ExamType.MID_TERM || t === 'mid_term') return 'Mid-Term';
  if (t === ExamType.END_TERM || t === 'end_term') return 'End of Term';
  if (t === ExamType.ASSIGNMENT || t === 'assignment') return 'Assignment';
  if (t === ExamType.QUIZ || t === 'quiz') return 'Quiz';
  return String(type || 'Exam');
}

function studentFullName(student: Student | undefined | null): string {
  if (!student) return '';
  return `${student.firstName || ''} ${student.lastName || ''}`.trim();
}

function parentFullName(parent: Parent | undefined | null): string {
  if (!parent) return '';
  return `${parent.firstName || ''} ${parent.lastName || ''}`.trim() || parent.email || 'Parent';
}

interface UnviewedChildEntry {
  studentId: string;
  studentName: string;
  studentNumber: string | null;
  classId: string;
  className: string;
  examType: string;
  examTypeLabel: string;
  term: string;
}

interface UnviewedParentEntry {
  parentId: string;
  parentName: string;
  phoneNumber: string | null;
  email: string | null;
  unviewedCount: number;
  children: UnviewedChildEntry[];
}

/**
 * Returns parents who have linked children with published report cards that
 * the parent has not yet viewed (no ReportCardView record), grouped by parent.
 *
 * A parent is excluded from the results only if they have viewed ALL of their
 * children's report cards for the selected term and exam type. If they have viewed
 * some but not all, they will appear showing only the unviewed ones.
 *
 * A report card is considered "available" when:
 *   - the Exam for the student's class + exam type + term is PUBLISHED, AND
 *   - the student has at least one mark recorded for that exam.
 *
 * Query params (all optional):
 *   - term:     filter to a specific term (e.g. "Term 1")
 *   - examType: filter to a specific exam type (e.g. "mid_term", "end_term")
 */
export const getUnviewedParents = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const termFilter = typeof req.query.term === 'string' ? req.query.term.trim() : '';
    const examTypeFilter = typeof req.query.examType === 'string' ? req.query.examType.trim() : '';

    const examRepository = AppDataSource.getRepository(Exam);
    const marksRepository = AppDataSource.getRepository(Marks);
    const studentRepository = AppDataSource.getRepository(Student);
    const parentStudentRepository = AppDataSource.getRepository(ParentStudent);
    const reportCardViewRepository = AppDataSource.getRepository(ReportCardView);

    const examWhere: any = { status: ExamStatus.PUBLISHED };
    if (termFilter) examWhere.term = termFilter;
    if (examTypeFilter) examWhere.type = examTypeFilter as ExamType;

    const publishedExams = await examRepository.find({
      where: examWhere,
      relations: ['classEntity']
    });

    if (publishedExams.length === 0) {
      return res.json({ parents: [], totalParents: 0, totalUnviewed: 0 });
    }

    const examIds = publishedExams.map((e) => e.id);

    // Marks grouped by exam -> set of studentIds (only students with results count).
    const marks = await marksRepository.find({
      where: { examId: In(examIds) },
      select: ['studentId', 'examId']
    });
    const studentsByExam = new Map<string, Set<string>>();
    const allStudentIdsSet = new Set<string>();
    for (const m of marks) {
      if (!m.studentId) continue;
      let set = studentsByExam.get(m.examId);
      if (!set) {
        set = new Set<string>();
        studentsByExam.set(m.examId, set);
      }
      set.add(m.studentId);
      allStudentIdsSet.add(m.studentId);
    }

    const allStudentIds = [...allStudentIdsSet];
    if (allStudentIds.length === 0) {
      return res.json({ parents: [], totalParents: 0, totalUnviewed: 0 });
    }

    const [students, links, views] = await Promise.all([
      studentRepository.find({
        where: { id: In(allStudentIds) },
        relations: ['classEntity']
      }),
      parentStudentRepository.find({
        where: { studentId: In(allStudentIds) },
        relations: ['parent']
      }),
      reportCardViewRepository.find({
        where: { studentId: In(allStudentIds) }
      })
    ]);

    const studentById = new Map<string, Student>();
    for (const s of students) studentById.set(s.id, s);

    // parentsByStudent: studentId -> Parent[]
    const parentsByStudent = new Map<string, Parent[]>();
    for (const link of links) {
      if (!link.parent) continue;
      const arr = parentsByStudent.get(link.studentId) || [];
      arr.push(link.parent);
      parentsByStudent.set(link.studentId, arr);
    }

    // viewedSet: key "parentId|studentId|examType|term"
    const viewedSet = new Set<string>();
    for (const v of views) {
      viewedSet.add(`${v.parentId}|${v.studentId}|${v.examType}|${v.term}`);
    }

    // Track for each parent: total available report cards and how many they've viewed
    const parentStats = new Map<string, { total: number; viewed: number }>();

    // Group unviewed entries by parent.
    const parentsMap = new Map<string, UnviewedParentEntry>();
    let totalUnviewed = 0;

    for (const exam of publishedExams) {
      const studentIdsForExam = studentsByExam.get(exam.id);
      if (!studentIdsForExam || studentIdsForExam.size === 0) continue;

      const className = (exam.classEntity as any)?.name || '';
      const examTypeStr = String(exam.type);
      const termStr = String(exam.term || '');

      for (const studentId of studentIdsForExam) {
        const parents = parentsByStudent.get(studentId);
        if (!parents || parents.length === 0) continue;

        const student = studentById.get(studentId);
        const studentName = studentFullName(student);

        for (const parent of parents) {
          const key = `${parent.id}|${studentId}|${examTypeStr}|${termStr}`;

          // Track total available report cards for this parent
          let stats = parentStats.get(parent.id);
          if (!stats) {
            stats = { total: 0, viewed: 0 };
            parentStats.set(parent.id, stats);
          }
          stats.total += 1;

          if (viewedSet.has(key)) {
            // Parent has viewed this specific report card
            stats.viewed += 1;
            continue;
          }

          const childEntry: UnviewedChildEntry = {
            studentId,
            studentName,
            studentNumber: (student as any)?.studentNumber || null,
            classId: String(exam.classId),
            className,
            examType: examTypeStr,
            examTypeLabel: examTypeLabel(examTypeStr),
            term: termStr
          };

          let entry = parentsMap.get(parent.id);
          if (!entry) {
            entry = {
              parentId: parent.id,
              parentName: parentFullName(parent),
              phoneNumber: parent.phoneNumber || null,
              email: parent.email || null,
              unviewedCount: 0,
              children: []
            };
            parentsMap.set(parent.id, entry);
          }
          entry.children.push(childEntry);
          entry.unviewedCount += 1;
          totalUnviewed += 1;
        }
      }
    }

    // Filter out parents who have viewed ALL of their children's report cards
    // for the selected term and exam type
    for (const [parentId, stats] of parentStats.entries()) {
      if (stats.viewed === stats.total && stats.total > 0) {
        // Parent has viewed all available report cards - exclude them
        parentsMap.delete(parentId);
      }
    }

    // Recalculate totalUnviewed after filtering
    totalUnviewed = 0;
    for (const entry of parentsMap.values()) {
      totalUnviewed += entry.unviewedCount;
    }

    const parents = [...parentsMap.values()].sort((a, b) =>
      a.parentName.localeCompare(b.parentName, undefined, { sensitivity: 'base' })
    );

    res.json({
      parents,
      totalParents: parents.length,
      totalUnviewed
    });
  } catch (error: any) {
    console.error('[getUnviewedParents] Error:', error);
    res.status(500).json({ message: 'Server error', error: error?.message || 'Unknown error' });
  }
};

interface NotifyBody {
  parentId?: string;
  studentId?: string;
  examType?: string;
  term?: string;
  customMessage?: string;
}

/**
 * Sends a WhatsApp message to a parent prompting them to view their child's
 * report card. Reuses the existing WhatsApp Cloud API service (with dry-run
 * support) and returns a wa.me fallback link so the admin can send manually
 * if the API is not configured.
 */
export const notifyParent = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { parentId, studentId, examType, term, customMessage } = (req.body || {}) as NotifyBody;

    if (!parentId || !studentId || !examType || !term) {
      return res
        .status(400)
        .json({ message: 'parentId, studentId, examType and term are required' });
    }

    const parentRepository = AppDataSource.getRepository(Parent);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);

    const parent = await parentRepository.findOne({ where: { id: parentId } });
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }

    const student = await studentRepository.findOne({
      where: { id: studentId },
      relations: ['classEntity']
    });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const settingsList = await settingsRepository.find({ order: { createdAt: 'DESC' }, take: 1 });
    const settings = settingsList.length > 0 ? settingsList[0] : null;
    const schoolName = String(settings?.schoolName || 'the school').trim() || 'the school';

    const studentName = studentFullName(student) || 'your child';
    const className = (student as any)?.classEntity?.name || '';
    const label = examTypeLabel(String(examType));
    const termStr = String(term);

    const defaultMessage =
      `Dear ${parent.firstName || 'Parent'}, ${studentName}'s ${label} report card for ${termStr}` +
      `${className ? ` (${className})` : ''} is now available. ` +
      `Please log in to the parent portal to view it. — ${schoolName}`;

    const message = (customMessage && String(customMessage).trim()) || defaultMessage;

    const normalizedPhone = normalizeWhatsAppRecipient(parent.phoneNumber);
    if (!normalizedPhone) {
      const fallback = buildWhatsAppWebUrl(parent.phoneNumber || '', message);
      return res.status(200).json({
        ok: false,
        sent: false,
        skipped: false,
        dryRun: false,
        error: null,
        message: 'Parent has no valid WhatsApp phone number on file.',
        fallbackUrl: fallback,
        composedMessage: message
      });
    }

    const fallbackUrl = buildWhatsAppWebUrl(normalizedPhone, message);

    // If the WhatsApp Cloud API is not configured (missing/placeholder
    // credentials), skip the API call entirely and hand the admin a wa.me deep
    // link so they can still send the message manually via WhatsApp.
    if (!isWhatsAppConfigured()) {
      return res.status(200).json({
        ok: false,
        sent: false,
        skipped: false,
        dryRun: false,
        error: null,
        message:
          'WhatsApp Cloud API is not configured. Use the button below to open WhatsApp and send the report card message to this parent.',
        fallbackUrl,
        composedMessage: message,
        recipient: normalizedPhone
      });
    }

    const result = await sendWhatsAppMessage(normalizedPhone, message);

    if (result.ok && !result.skipped) {
      return res.status(200).json({
        ok: true,
        sent: true,
        skipped: false,
        dryRun: false,
        error: null,
        message: 'Message sent via WhatsApp Cloud API.',
        fallbackUrl,
        composedMessage: message,
        recipient: normalizedPhone
      });
    }

    if (result.skipped) {
      return res.status(200).json({
        ok: true,
        sent: false,
        skipped: true,
        dryRun: !!result.dryRun,
        error: null,
        message: 'Dry run — message was logged instead of sent (WHATSAPP_DRY_RUN=true).',
        fallbackUrl,
        composedMessage: message,
        recipient: normalizedPhone
      });
    }

    // API call failed (e.g. invalid/expired access token). Return a friendly
    // message and keep the raw error for logs, but always offer the wa.me link
    // so the admin can still deliver the message manually.
    console.warn('[notifyParent] WhatsApp send failed:', result.error);
    return res.status(200).json({
      ok: false,
      sent: false,
      skipped: false,
      dryRun: false,
      error: null,
      message:
        'WhatsApp Cloud API could not send the message (the access token may be invalid or expired). Use the button below to open WhatsApp and send it manually.',
      apiError: result.error || null,
      fallbackUrl,
      composedMessage: message,
      recipient: normalizedPhone
    });
  } catch (error: any) {
    console.error('[notifyParent] Error:', error);
    res.status(500).json({ message: 'Server error', error: error?.message || 'Unknown error' });
  }
};

interface SendReportCardBody {
  parentId?: string;
  studentId?: string;
  classId?: string;
  examType?: string;
  term?: string;
}

/**
 * Generates a student's report card PDF (reusing the existing
 * GET /exams/report-card/pdf endpoint via an internal request) and
 * sends it to the parent as a WhatsApp document message.
 *
 * When the WhatsApp Cloud API is not configured / has invalid credentials,
 * returns a wa.me fallback URL so the admin can share the file manually.
 */
export const sendReportCard = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { parentId, studentId, classId, examType, term } = (req.body || {}) as SendReportCardBody;

    if (!parentId || !studentId || !classId || !examType || !term) {
      return res.status(400).json({
        message: 'parentId, studentId, classId, examType and term are required'
      });
    }

    const parentRepository = AppDataSource.getRepository(Parent);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);

    const [parent, student, settingsList] = await Promise.all([
      parentRepository.findOne({ where: { id: parentId } }),
      studentRepository.findOne({ where: { id: studentId }, relations: ['classEntity'] }),
      settingsRepository.find({ order: { createdAt: 'DESC' }, take: 1 })
    ]);

    if (!parent) return res.status(404).json({ message: 'Parent not found' });
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const settings = settingsList.length > 0 ? settingsList[0] : null;
    const schoolName = String(settings?.schoolName || 'School').trim() || 'School';

    const normalizedPhone = normalizeWhatsAppRecipient(parent.phoneNumber);
    const studentName = studentFullName(student) || 'Student';
    const label = examTypeLabel(String(examType));
    const termStr = String(term);
    const className = (student as any)?.classEntity?.name || '';

    const caption =
      `${studentName}'s ${label} report card — ${termStr}` +
      `${className ? ` (${className})` : ''}. — ${schoolName}`;

    const filename =
      `${studentName.replace(/\s+/g, '_')}_${label.replace(/\s+/g, '_')}_${termStr.replace(/\s+/g, '_')}_ReportCard.pdf`
        .replace(/[^a-zA-Z0-9_\-\.]/g, '');

    // ── Step 1: Generate the PDF via internal call ──────────────────
    // We re-use the existing /exams/report-card/pdf endpoint so that all
    // the complex data assembly (marks, grades, rankings, remarks, settings)
    // is handled by the battle-tested controller rather than duplicated here.
    const authHeader = req.headers['authorization'] || '';
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:3001';
    const pdfUrl =
      `${protocol}://${host}/api/exams/report-card/pdf` +
      `?classId=${encodeURIComponent(classId)}&examType=${encodeURIComponent(examType)}` +
      `&term=${encodeURIComponent(term)}&studentId=${encodeURIComponent(studentId)}`;

    let pdfBuffer: Buffer;
    try {
      const pdfRes = await axios.get(pdfUrl, {
        headers: { Authorization: authHeader },
        responseType: 'arraybuffer',
        timeout: 60000
      });
      pdfBuffer = Buffer.from(pdfRes.data);
    } catch (pdfErr: any) {
      const status = pdfErr?.response?.status;
      const errMsg =
        pdfErr?.response?.data
          ? (() => {
              try {
                return JSON.parse(Buffer.from(pdfErr.response.data).toString('utf8'))?.message || '';
              } catch {
                return '';
              }
            })()
          : pdfErr?.message || 'Failed to generate report card PDF';
      return res.status(200).json({
        ok: false,
        sent: false,
        skipped: false,
        dryRun: false,
        error: null,
        message: `Could not generate report card PDF: ${errMsg || `HTTP ${status}`}. The exam results may not have been published yet.`,
        fallbackUrl: normalizedPhone ? `https://wa.me/${normalizedPhone}` : null,
        filename
      });
    }

    // ── Step 2: Send via WhatsApp (or return fallback) ──────────────
    if (!normalizedPhone) {
      return res.status(200).json({
        ok: false,
        sent: false,
        skipped: false,
        dryRun: false,
        error: null,
        message: 'Parent has no valid WhatsApp phone number on file. The PDF was generated but could not be sent.',
        fallbackUrl: null,
        filename
      });
    }

    const fallbackUrl = `https://wa.me/${normalizedPhone}`;

    if (!isWhatsAppConfigured()) {
      return res.status(200).json({
        ok: false,
        sent: false,
        skipped: false,
        dryRun: false,
        error: null,
        message:
          'WhatsApp Cloud API is not configured. The report card PDF was generated but could not be sent automatically. Open WhatsApp to send it manually.',
        fallbackUrl,
        filename
      });
    }

    const result = await sendWhatsAppDocument(normalizedPhone, pdfBuffer, filename, caption);

    if (result.ok && !result.skipped) {
      return res.status(200).json({
        ok: true,
        sent: true,
        skipped: false,
        dryRun: false,
        error: null,
        message: `Report card PDF sent to ${parent.firstName || 'parent'} via WhatsApp.`,
        fallbackUrl,
        filename
      });
    }

    if (result.skipped) {
      return res.status(200).json({
        ok: true,
        sent: false,
        skipped: true,
        dryRun: !!result.dryRun,
        error: null,
        message: 'Dry run — report card PDF was generated and logged but not sent (WHATSAPP_DRY_RUN=true).',
        fallbackUrl,
        filename
      });
    }

    console.warn('[sendReportCard] WhatsApp document send failed:', result.error);
    return res.status(200).json({
      ok: false,
      sent: false,
      skipped: false,
      dryRun: false,
      error: null,
      message:
        'WhatsApp Cloud API could not send the report card PDF (the access token may be invalid or expired). Open WhatsApp to send it manually.',
      apiError: result.error || null,
      fallbackUrl,
      filename
    });
  } catch (error: any) {
    console.error('[sendReportCard] Error:', error);
    res.status(500).json({ message: 'Server error', error: error?.message || 'Unknown error' });
  }
};

// ─── Fast admin report-card preview ────────────────────────────────────────
// Re-use helpers that are already imported into exam.controller.ts by importing
// them here too, so we don't depend on an internal HTTP round-trip.
import { createReportCardPDF } from '../utils/pdfGenerator';
import {
  computeCoreAverageFromMarks,
  computeCoreAverageFromReportSubjects,
} from '../utils/markSheetSubjectOrder';
import { ExamType as ExamTypeEnum } from '../entities/Exam';
import { Class } from '../entities/Class';
import { Subject } from '../entities/Subject';
import { Attendance, AttendanceStatus } from '../entities/Attendance';

/** Normalise exam-type strings to the enum value used in the DB. */
function normalizeExamTypeLocal(type: string): ExamTypeEnum {
  const t = String(type || '').toLowerCase().replace(/-/g, '_').trim();
  if (t === 'mid_term' || t === 'midterm') return ExamTypeEnum.MID_TERM;
  if (t === 'end_term' || t === 'endterm') return ExamTypeEnum.END_TERM;
  if (t === 'assignment') return ExamTypeEnum.ASSIGNMENT;
  if (t === 'quiz') return ExamTypeEnum.QUIZ;
  const vals = Object.values(ExamTypeEnum) as string[];
  if (vals.includes(t)) return t as ExamTypeEnum;
  throw new Error(`Unknown exam type: ${type}`);
}

function assignPositionsLocal<T extends { studentId: string; average: number }>(
  rows: T[]
): Array<T & { position: number }> {
  const sorted = [...rows].sort((a, b) => b.average - a.average);
  let position = 1;
  let prev: number | null = null;
  return sorted.map((row, i) => {
    if (row.average !== prev) { position = i + 1; prev = row.average; }
    return { ...row, position };
  });
}

function getGradeLocal(
  percentage: number,
  thresholds: any,
  labels: any
): string {
  if (percentage === 0) return labels?.fail || 'F';
  if (percentage >= (thresholds?.excellent ?? 90)) return labels?.excellent || 'A+';
  if (percentage >= (thresholds?.veryGood  ?? 80)) return labels?.veryGood  || 'A';
  if (percentage >= (thresholds?.good      ?? 70)) return labels?.good      || 'B';
  if (percentage >= (thresholds?.satisfactory ?? 60)) return labels?.satisfactory || 'C';
  if (percentage >= (thresholds?.needsImprovement ?? 50)) return labels?.needsImprovement || 'D';
  if (percentage >= (thresholds?.basic ?? 1)) return labels?.basic || 'E';
  return labels?.fail || 'F';
}

/**
 * Fast admin-only report-card PDF preview.
 *
 * Speed improvements over the standard GET /exams/report-card/pdf path:
 *  - Skips fee-balance checks (admin bypass)
 *  - Skips full class-roster fetch; only loads student IDs for ranking
 *  - Parallelises all independent DB queries with Promise.all
 *  - Skips the intermediate JSON/data step; goes straight to createReportCardPDF
 *  - Minimises relations loaded (no heavy joins beyond what's needed)
 */
export const previewReportCardAdmin = async (req: AuthRequest, res: Response) => {
  const startTime = Date.now();
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const { studentId, classId, examType, term } = req.query as Record<string, string>;
    if (!studentId || !classId || !examType || !term) {
      return res.status(400).json({ message: 'studentId, classId, examType and term are required' });
    }

    let normalizedType: ExamTypeEnum;
    try {
      normalizedType = normalizeExamTypeLocal(examType);
    } catch {
      return res.status(400).json({ message: `Unknown exam type: ${examType}` });
    }

    // Check cache first
    const cacheKey = `${studentId}|${classId}|${examType}|${term}`;
    const cached = pdfPreviewCache.get(cacheKey);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
      const safeStudentName = studentId.replace(/[^a-zA-Z0-9_]/g, '');
      const filename = `${safeStudentName}_ReportCard.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Content-Length', cached.buffer.length);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Cache', 'HIT');
      console.log(`[previewReportCardAdmin] Cache HIT - ${(Date.now() - startTime)}ms`);
      return res.end(cached.buffer);
    }

    const examRepo     = AppDataSource.getRepository(Exam);
    const marksRepo    = AppDataSource.getRepository(Marks);
    const studentRepo  = AppDataSource.getRepository(Student);
    const classRepo    = AppDataSource.getRepository(Class);
    const settingsRepo = AppDataSource.getRepository(Settings);
    const attendRepo   = AppDataSource.getRepository(Attendance);

    // ── Step 1: all independent lookups in parallel ──────────────────
    const step1Start = Date.now();
    const [exams, student, classEntity, settingsList] = await Promise.all([
      examRepo.find({
        where: { classId, type: normalizedType, term },
        relations: ['subjects'],
      }),
      studentRepo.findOne({ where: { id: studentId }, relations: ['classEntity'] }),
      classRepo.findOne({ where: { id: classId }, relations: ['subjects'] }),
      settingsRepo.find({ order: { createdAt: 'DESC' }, take: 1 }),
    ]);
    console.log(`[previewReportCardAdmin] Step 1 (DB lookups): ${Date.now() - step1Start}ms`);

    if (!student) return res.status(404).json({ message: 'Student not found' });
    if (!classEntity) return res.status(404).json({ message: 'Class not found' });

    const publishedExams = exams.filter(e => e.status === ExamStatus.PUBLISHED);
    if (publishedExams.length === 0) {
      return res.status(404).json({
        message: `No published ${examType} exams found for ${term}. The results may not have been published yet.`
      });
    }

    const settings = settingsList[0] ?? null;
    const examIds  = publishedExams.map(e => e.id);

    // ── Step 2: only this student's marks + attendance (skip class marks for preview) ───────────────────
    const step2Start = Date.now();
    const [studentMarks, attendance] = await Promise.all([
      // Only this student's marks (no class averages needed for preview)
      marksRepo.find({
        where: { studentId, examId: In(examIds) },
        select: ['studentId', 'subjectId', 'examId', 'score', 'maxScore'],
        relations: ['subject'],
      }),
      // This student's attendance
      attendRepo.find({ where: { studentId, term } }),
    ]);
    console.log(`[previewReportCardAdmin] Step 2 (marks+attendance): ${Date.now() - step2Start}ms`);

    // ── Step 3: build subject data for this student ──────────────────
    const allSubjects: Subject[] = classEntity.subjects?.length
      ? classEntity.subjects
      : [...new Map(publishedExams.flatMap(e => e.subjects ?? []).map(s => [s.id, s])).values()];

    // Skip class averages for preview (speed optimization)
    const classAverages: Record<string, number> = {};

    const thresholds = (settings as any)?.gradeThresholds  ?? {};
    const labels     = (settings as any)?.gradeLabels       ?? {};

    // Best mark per subject for this student (latest exam wins for duplicates)
    const bestBySubject = new Map<string, Marks>();
    for (const m of studentMarks) {
      const prev = bestBySubject.get(m.subjectId);
      if (!prev || new Date(m.examId) > new Date(prev.examId)) bestBySubject.set(m.subjectId, m);
    }

    const subjectData = allSubjects.map(sub => {
      const mark = bestBySubject.get(sub.id);
      const score    = mark ? Number(mark.score)    : 0;
      const maxScore = mark ? Number(mark.maxScore) : 100;
      const pct      = maxScore > 0 ? (score / maxScore) * 100 : 0;
      return {
        subject:      sub.name,
        subjectCode:  (sub as any).code ?? undefined,
        score,
        maxScore,
        percentage:   pct.toFixed(1),
        classAverage: classAverages[sub.name] ?? 0,
        grade:        getGradeLocal(pct, thresholds, labels),
      };
    });

    const overallAverage = computeCoreAverageFromReportSubjects(subjectData);

    // ── Step 4: class ranking (skip for preview to improve speed) ───
    // For preview, use placeholder values instead of calculating actual rankings
    const classPosition = 0;
    const totalStudents = 0;

    // ── Step 5: remarks (fast — skip for preview) ──────
    // For preview, use empty remarks to improve speed
    const ensuredRemarks = {
      classTeacherRemarks: '',
      headmasterRemarks: ''
    };

    // Attendance
    const totalAttendance   = attendance.length;
    const presentAttendance = attendance.filter(
      a => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.EXCUSED
    ).length;

    // Unique exam list for PDF header
    const uniqueExams = [...new Map(publishedExams.map(e => [e.name, e])).values()]
      .map(e => ({ id: e.id, name: e.name, examDate: e.examDate }));

    // ── Step 6: generate PDF ─────────────────────────────────────────
    const step6Start = Date.now();
    const reportCardData = {
      student: {
        id:           student.id,
        name:         `${student.firstName} ${student.lastName}`,
        studentNumber: student.studentNumber ?? '',
        class:        classEntity.name ?? '',
      },
      examType,
      exams:         uniqueExams,
      subjects:      subjectData,
      overallAverage: overallAverage.toString(),
      overallGrade:  getGradeLocal(overallAverage, thresholds, labels),
      classPosition,
      formPosition:  0,
      totalStudents,
      totalStudentsPerStream: 0,
      totalAttendance,
      presentAttendance,
      remarks: {
        classTeacherRemarks: ensuredRemarks.classTeacherRemarks,
        headmasterRemarks:   ensuredRemarks.headmasterRemarks,
      },
      generatedAt: new Date(),
    };

    const pdfBuffer = await createReportCardPDF(reportCardData, settings, true); // Skip measurement for preview
    console.log(`[previewReportCardAdmin] Step 6 (PDF generation): ${Date.now() - step6Start}ms`);

    // Cache the generated PDF for future requests
    pdfPreviewCache.set(cacheKey, {
      buffer: pdfBuffer,
      timestamp: Date.now()
    });

    const safeStudentName = `${student.firstName}_${student.lastName}`.replace(/[^a-zA-Z0-9_]/g, '');
    const filename = `${safeStudentName}_ReportCard.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Cache', 'MISS');
    console.log(`[previewReportCardAdmin] Total time: ${Date.now() - startTime}ms`);
    return res.end(pdfBuffer);
  } catch (err: any) {
    console.error('[previewReportCardAdmin]', err?.message || err);
    return res.status(500).json({ message: err?.message || 'Server error generating report card preview' });
  }
};
