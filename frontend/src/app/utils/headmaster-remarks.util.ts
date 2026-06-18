export interface HeadmasterRemarkSubject {
  subject?: string;
  name?: string;
  subjectName?: string;
  percentage?: string | number;
  score?: number;
  maxScore?: number;
  grade?: string;
}

export interface HeadmasterRemarkInput {
  studentName?: string;
  headmasterName?: string;
  overallAverage?: string | number;
  subjects?: HeadmasterRemarkSubject[];
}

function getSubjectPercentage(sub: HeadmasterRemarkSubject): number {
  if (sub.percentage !== undefined && sub.percentage !== null && String(sub.percentage).trim() !== '') {
    const parsed = parseFloat(String(sub.percentage));
    if (!Number.isNaN(parsed)) return parsed;
  }
  const score = parseFloat(String(sub.score ?? 0));
  const max = parseFloat(String(sub.maxScore ?? 0));
  return max > 0 ? (score / max) * 100 : 0;
}

function getAssessedSubjects(subjects: HeadmasterRemarkSubject[] | undefined): HeadmasterRemarkSubject[] {
  return (subjects || []).filter((sub) => {
    if (String(sub.grade || '').trim().toUpperCase() === 'N/A') return false;
    const max = parseFloat(String(sub.maxScore ?? 0));
    return max > 0;
  });
}

function parseAverage(value: string | number | undefined): number {
  if (typeof value === 'number') return value;
  const parsed = parseFloat(String(value ?? ''));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Build a performance-based head's remark with the headmaster's name appended. */
export function generateHeadmasterRemark(input: HeadmasterRemarkInput): string {
  const headName = String(input.headmasterName || '').trim();
  const studentName = String(input.studentName || '').trim();
  const namePart = studentName ? ` by ${studentName}` : '';
  const signature = headName ? `. ${headName}` : '';

  const assessedSubjects = getAssessedSubjects(input.subjects);
  const failedSubjects = assessedSubjects.filter((sub) => getSubjectPercentage(sub) < 50);
  const allSubjectsUnder50 = assessedSubjects.length > 0 && failedSubjects.length === assessedSubjects.length;
  const someSubjectsUnder50 = assessedSubjects.length > 0 && failedSubjects.length > 0 && failedSubjects.length < assessedSubjects.length;
  const average = parseAverage(input.overallAverage);

  if (allSubjectsUnder50) {
    return `The learner requires urgent and sustained support${namePart}. Close follow-up and serious commitment are essential for improvement${signature}`;
  }

  if (someSubjectsUnder50) {
    const criticallyLowSubjects = failedSubjects.filter((sub) => getSubjectPercentage(sub) < 30);
    const subjectNames = failedSubjects
      .map((sub) => sub.subject || sub.name || sub.subjectName)
      .filter(Boolean)
      .join(', ');

    let performancePrefix = '';
    if (average >= 75) {
      performancePrefix = `A commendable overall performance${namePart}, however, serious attention is needed in ${subjectNames} where results are below expectation`;
    } else if (average >= 65) {
      performancePrefix = `Good overall performance${namePart}, but targeted support in ${subjectNames} is essential for a balanced academic profile`;
    } else if (average >= 50) {
      performancePrefix = `Satisfactory overall performance${namePart}, yet improvement is required in ${subjectNames}`;
    } else {
      performancePrefix = `Overall performance is below expected level${namePart}. Immediate intervention is required in ${subjectNames}`;
    }

    if (criticallyLowSubjects.length > 0) {
      const criticalNames = criticallyLowSubjects
        .map((sub) => sub.subject || sub.name || sub.subjectName)
        .filter(Boolean)
        .join(', ');
      return `${performancePrefix}. Note that performance in ${criticalNames} is critically low${signature}`;
    }

    return `${performancePrefix}${signature}`;
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

export function buildHeadmasterRemarkFromCard(card: any, headmasterName: string): string {
  return generateHeadmasterRemark({
    studentName: card?.student?.name,
    headmasterName,
    overallAverage: card?.overallAverage,
    subjects: card?.subjects,
  });
}
