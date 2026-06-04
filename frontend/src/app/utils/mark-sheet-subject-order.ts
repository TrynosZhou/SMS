/** Display order: Mathematics, English, Science, then other subjects A–Z. */
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

export const MARK_SHEET_CORE_SUBJECT_COUNT = 3;
export const MARK_SHEET_CORE_MAX_TOTAL = 300;

/** Subject marks on mark sheet: blue bold in UI/PDF */
export const MARK_SHEET_SCORE_BLUE = '#2563eb';

export function getMarkSheetScoreColor(_percentage?: number): string {
  return MARK_SHEET_SCORE_BLUE;
}

/** Average column: always two decimal places (e.g. 89.00). */
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

export function computeCoreMarkSheetTotals(
  row: { subjects?: Record<string, { score?: number; percentage?: number }> },
  classSubjects: Array<{ id: string; name?: string }>
): { totalScore: number; totalMaxScore: number; average: number } {
  let coreTotalScore = 0;
  for (const subject of classSubjects) {
    if (!isCoreSubjectName(subject.name || '')) {
      continue;
    }
    const cell = row.subjects?.[subject.id];
    coreTotalScore += Math.round(Number(cell?.score ?? cell?.percentage) || 0);
  }
  return {
    totalScore: coreTotalScore,
    totalMaxScore: MARK_SHEET_CORE_MAX_TOTAL,
    average: Number((coreTotalScore / MARK_SHEET_CORE_SUBJECT_COUNT).toFixed(2))
  };
}

/** Report-card summary: sum of core subject scores on the card ÷ 3 (matches mark sheet). */
export function computeCoreAverageFromReportSubjects(
  subjects: Array<{
    subject?: string;
    score?: number;
    maxScore?: number;
    grade?: string;
  }>
): number {
  const buckets = { math: 0, english: 0, science: 0 };
  for (const row of subjects) {
    const name = (row.subject || '').toString();
    if (!isCoreSubjectName(name)) continue;
    const n = normalizeSubjectName(name);
    const isNa = row.grade === 'N/A' || Number(row.maxScore) === 0;
    const score = isNa ? 0 : Math.round(Number(row.score) || 0);
    if (n === 'mathematics' || n === 'math' || n === 'maths') {
      buckets.math = score;
    } else if (n === 'english' || n.startsWith('english')) {
      buckets.english = score;
    } else if (n === 'science' || n.startsWith('science')) {
      buckets.science = score;
    }
  }
  const total = buckets.math + buckets.english + buckets.science;
  return Number((total / MARK_SHEET_CORE_SUBJECT_COUNT).toFixed(2));
}

export function sortMarkSheetSubjectsForDisplay<T extends { name?: string }>(subjects: T[]): T[] {
  if (!subjects?.length) {
    return [];
  }
  return [...subjects].sort((a, b) => {
    const pa = markSheetSubjectPriority(a.name || '');
    const pb = markSheetSubjectPriority(b.name || '');
    if (pa !== pb) {
      return pa - pb;
    }
    return normalizeSubjectName(a.name || '').localeCompare(normalizeSubjectName(b.name || ''));
  });
}
