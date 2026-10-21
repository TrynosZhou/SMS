import { Repository } from 'typeorm';
import { ReportCardRemarks } from '../entities/ReportCardRemarks';
import {
  generateReportCardRemark,
  isOpenAiConfigured,
  ReportCardAiSubject,
} from '../services/reportCardAi.service';
import {
  generateClassTeacherRemark,
  generateHeadmasterRemark,
  HeadmasterRemarkSubject,
} from './headmasterRemarks';

export interface EnsureReportCardRemarksInput {
  remarksRepository: Repository<ReportCardRemarks>;
  studentId: string;
  classId: string;
  examType: string;
  studentName: string;
  className?: string;
  term?: string;
  examTypeLabel?: string;
  headmasterName?: string;
  overallAverage?: string | number;
  position?: string | number;
  totalStudents?: string | number;
  subjects?: Array<ReportCardAiSubject | HeadmasterRemarkSubject>;
  /** Existing DB row if already loaded (avoids a second query). */
  existing?: ReportCardRemarks | null;
  /** Persist generated remarks (default true). */
  persist?: boolean;
  /**
   * When true (default), missing remarks may call OpenAI.
   * Bulk class report-card generation should pass false — OpenAI per student
   * makes /report-cards take minutes in production.
   */
  useAi?: boolean;
}

export interface EnsuredRemarks {
  id: string | null;
  classTeacherRemarks: string;
  headmasterRemarks: string;
}

function trimRemark(value: string | null | undefined): string {
  return String(value || '').trim();
}

/**
 * Clean up redundant "by [name]" patterns from remarks.
 * This handles legacy remarks where the student name was duplicated.
 */
function cleanRedundantNamePattern(remark: string): string {
  // Pattern: matches " by [Name]" at the end of a sentence (before the headmaster signature)
  // Looks for pattern like: "... by John Smith. Headmaster Name"
  // We remove the " by John Smith" part but keep the period and signature
  return remark.replace(/ by [A-Z][a-zA-Z\s]+(?=\. \s*[A-Z])/g, '.');
}

/**
 * Check if a remark contains harsh language that should be replaced.
 * Returns true if the remark contains words like "urgent", "must", "requires", etc.
 */
function containsHarshLanguage(remark: string): boolean {
  const harshPatterns = [
    /urgent/i,
    /must/i,
    /requires.*support/i,
    /requires.*supervision/i,
    /closer.*monitoring/i,
    /serious.*commitment/i,
    /essential.*improvement/i
  ];
  return harshPatterns.some(pattern => pattern.test(remark));
}

async function generateOneRemark(
  remarkType: 'classTeacher' | 'headmaster',
  input: EnsureReportCardRemarksInput
): Promise<string> {
  const subjects = (input.subjects || []) as ReportCardAiSubject[];
  const fallback =
    remarkType === 'classTeacher'
      ? generateClassTeacherRemark({
          studentName: input.studentName,
          overallAverage: input.overallAverage,
          subjects: input.subjects as HeadmasterRemarkSubject[],
        })
      : generateHeadmasterRemark({
          studentName: input.studentName,
          headmasterName: input.headmasterName,
          overallAverage: input.overallAverage,
          subjects: input.subjects as HeadmasterRemarkSubject[],
        });

  if (!isOpenAiConfigured() || input.useAi === false) {
    return fallback;
  }

  try {
    const { remark } = await generateReportCardRemark({
      remarkType,
      studentName: input.studentName,
      className: input.className,
      term: input.term,
      examType: input.examTypeLabel || input.examType,
      overallAverage: input.overallAverage,
      position: input.position,
      totalStudents: input.totalStudents,
      headmasterName: input.headmasterName,
      subjects,
      count: 1,
    });
    const cleaned = trimRemark(remark);
    return cleaned || fallback;
  } catch (err: any) {
    console.warn(
      `[ensureReportCardRemarks] OpenAI ${remarkType} remark failed; using template:`,
      err?.message || err
    );
    return fallback;
  }
}

/**
 * Ensures every report card has both class-teacher and headmaster remarks.
 * Missing remarks are generated with OpenAI when configured, otherwise from
 * performance templates, then optionally persisted to report_card_remarks.
 */
export async function ensureReportCardRemarks(
  input: EnsureReportCardRemarksInput
): Promise<EnsuredRemarks> {
  const persist = input.persist !== false;
  const repo = input.remarksRepository;

  let row =
    input.existing !== undefined
      ? input.existing
      : await repo.findOne({
          where: {
            studentId: input.studentId,
            classId: input.classId,
            examType: input.examType,
          },
        });

  let classTeacherRemarks = cleanRedundantNamePattern(trimRemark(row?.classTeacherRemarks));
  let headmasterRemarks = cleanRedundantNamePattern(trimRemark(row?.headmasterRemarks));

  // Check if existing headmaster remark contains harsh language and should be regenerated
  const headContainsHarshLanguage = headmasterRemarks && containsHarshLanguage(headmasterRemarks);

  const needTeacher = !classTeacherRemarks;
  const needHead = !headmasterRemarks || headContainsHarshLanguage;

  if (!needTeacher && !needHead) {
    return {
      id: row?.id || null,
      classTeacherRemarks,
      headmasterRemarks,
    };
  }

  if (needTeacher && needHead) {
    const [teacher, head] = await Promise.all([
      generateOneRemark('classTeacher', input),
      generateOneRemark('headmaster', input),
    ]);
    classTeacherRemarks = teacher;
    headmasterRemarks = head;
  } else if (needTeacher) {
    classTeacherRemarks = await generateOneRemark('classTeacher', input);
  } else {
    headmasterRemarks = await generateOneRemark('headmaster', input);
  }

  if (persist && (needTeacher || needHead || headContainsHarshLanguage)) {
    if (!row) {
      row = repo.create({
        studentId: input.studentId,
        classId: input.classId,
        examType: input.examType,
        classTeacherRemarks: classTeacherRemarks || null,
        headmasterRemarks: headmasterRemarks || null,
      });
    } else {
      if (needTeacher) row.classTeacherRemarks = classTeacherRemarks || null;
      if (needHead || headContainsHarshLanguage) row.headmasterRemarks = headmasterRemarks || null;
    }
    try {
      row = await repo.save(row);
    } catch (err: any) {
      console.error('[ensureReportCardRemarks] Failed to persist remarks:', err?.message || err);
    }
  }

  return {
    id: row?.id || null,
    classTeacherRemarks,
    headmasterRemarks,
  };
}
