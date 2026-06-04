/**
 * Column order for mark sheets: Mathematics, English, Science, then all other subjects A–Z.
 */
function normalizeSubjectName(name: string): string {
  return String(name || '').trim().toLowerCase();
}

function markSheetSubjectPriority(name: string): number {
  const n = normalizeSubjectName(name);
  if (n === 'mathematics' || n === 'math' || n === 'maths') {
    return 0;
  }
  if (n === 'english' || n.startsWith('english ')) {
    return 1;
  }
  if (n === 'science' || n.startsWith('science ')) {
    return 2;
  }
  return 100;
}

export function sortMarkSheetSubjects<T extends { name?: string }>(subjects: T[]): T[] {
  return [...subjects].sort((a, b) => {
    const pa = markSheetSubjectPriority(a.name || '');
    const pb = markSheetSubjectPriority(b.name || '');
    if (pa !== pb) {
      return pa - pb;
    }
    return normalizeSubjectName(a.name || '').localeCompare(normalizeSubjectName(b.name || ''));
  });
}

/** Core subjects used for mark-sheet total (300) and average (÷ 3). */
export const MARK_SHEET_CORE_SUBJECT_COUNT = 3;
export const MARK_SHEET_CORE_MAX_TOTAL = 300;

export const MARK_SHEET_SCORE_BLUE = '#2563eb';

/** Subject marks on mark sheet: blue only */
export function getMarkSheetScoreColor(_percentage?: number): string {
  return MARK_SHEET_SCORE_BLUE;
}

export function formatMarkSheetAverage(average: number): string {
  const n = Number(average);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

export function isCoreSubjectName(name: string): boolean {
  const n = normalizeSubjectName(name);
  if (n === 'mathematics' || n === 'math' || n === 'maths') {
    return true;
  }
  if (n === 'english' || n.startsWith('english')) {
    return true;
  }
  if (n === 'science' || n.startsWith('science')) {
    return true;
  }
  return false;
}

export function finalizeMarkSheetCoreTotals(
  subjectMarksById: Record<string, { score?: number } | undefined>,
  classSubjects: Array<{ id: string; name?: string }>
): { totalScore: number; totalMaxScore: number; average: number } {
  let coreTotalScore = 0;
  for (const subject of classSubjects) {
    if (!isCoreSubjectName(subject.name || '')) {
      continue;
    }
    const cell = subjectMarksById[subject.id];
    coreTotalScore += Math.round(Number(cell?.score) || 0);
  }
  return {
    totalScore: coreTotalScore,
    totalMaxScore: MARK_SHEET_CORE_MAX_TOTAL,
    average: Number((coreTotalScore / MARK_SHEET_CORE_SUBJECT_COUNT).toFixed(2))
  };
}

type CoreBucket = 'mathematics' | 'english' | 'science';

function coreSubjectBucket(name: string): CoreBucket | null {
  const n = normalizeSubjectName(name);
  if (n === 'mathematics' || n === 'math' || n === 'maths') {
    return 'mathematics';
  }
  if (n === 'english' || n.startsWith('english')) {
    return 'english';
  }
  if (n === 'science' || n.startsWith('science')) {
    return 'science';
  }
  return null;
}

/** Mark-sheet rule: sum of core subject marks (each out of 100) ÷ 3. */
export function computeCoreAverageFromMarks(
  marks: Array<{
    subject?: { name: string } | null;
    score: number | string;
    examId?: string;
    updatedAt?: Date;
    createdAt?: Date;
  }>
): number {
  const bucketExamMap: Record<CoreBucket, Record<string, (typeof marks)[0]>> = {
    mathematics: {},
    english: {},
    science: {}
  };

  for (const mark of marks) {
    const name = mark.subject?.name ? String(mark.subject.name).trim() : '';
    const bucket = coreSubjectBucket(name);
    if (!bucket) continue;

    const eid = mark.examId || 'unknown';
    const existing = bucketExamMap[bucket][eid];
    const mDate = mark.updatedAt || mark.createdAt || new Date(0);
    const eDate = existing ? (existing.updatedAt || existing.createdAt || new Date(0)) : new Date(0);
    if (!existing || mDate > eDate) {
      bucketExamMap[bucket][eid] = mark;
    }
  }

  let coreTotalScore = 0;
  for (const bucket of ['mathematics', 'english', 'science'] as CoreBucket[]) {
    const examMarks = Object.values(bucketExamMap[bucket]);
    coreTotalScore += examMarks.reduce(
      (sum, m) => sum + Math.round(parseFloat(String(m.score)) || 0),
      0
    );
  }

  return Number((coreTotalScore / MARK_SHEET_CORE_SUBJECT_COUNT).toFixed(2));
}

/** Same as mark-sheet average using report-card subject rows (scores shown on the card). */
export function computeCoreAverageFromReportSubjects(
  subjects: Array<{
    subject?: string;
    score?: number;
    maxScore?: number;
    grade?: string;
  }>
): number {
  const bucketScores: Record<CoreBucket, number> = {
    mathematics: 0,
    english: 0,
    science: 0
  };

  for (const row of subjects) {
    const name = row.subject ? String(row.subject).trim() : '';
    const bucket = coreSubjectBucket(name);
    if (!bucket) continue;
    const isNa = row.grade === 'N/A' || Number(row.maxScore) === 0;
    bucketScores[bucket] = isNa ? 0 : Math.round(Number(row.score) || 0);
  }

  const coreTotalScore =
    bucketScores.mathematics + bucketScores.english + bucketScores.science;
  return Number((coreTotalScore / MARK_SHEET_CORE_SUBJECT_COUNT).toFixed(2));
}
