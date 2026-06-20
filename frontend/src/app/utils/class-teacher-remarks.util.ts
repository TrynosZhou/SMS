import {
  HeadmasterRemarkInput,
  HeadmasterRemarkSubject
} from './headmaster-remarks.util';

function parseAverage(value: string | number | undefined): number {
  if (typeof value === 'number') return value;
  const parsed = parseFloat(String(value ?? ''));
  return Number.isNaN(parsed) ? 0 : parsed;
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

/** Build a conduct- and effort-focused class teacher remark from report card data. */
export function generateClassTeacherRemark(input: HeadmasterRemarkInput): string {
  const studentName = String(input.studentName || 'The learner').trim();
  const average = parseAverage(input.overallAverage);
  const assessed = getAssessedSubjects(input.subjects);
  const weakCount = assessed.filter((sub) => getSubjectPercentage(sub) < 50).length;
  const strongCount = assessed.filter((sub) => getSubjectPercentage(sub) >= 70).length;

  if (average >= 80) {
    return `${studentName} demonstrates exemplary conduct, focus, and responsibility in class. Academic effort is consistently strong; continue to model positive leadership among peers.`;
  }
  if (average >= 70) {
    return `${studentName} is polite, cooperative, and well prepared for lessons. Maintains good discipline and participates actively; continued consistency will support further growth.`;
  }
  if (average >= 60) {
    if (weakCount > 0) {
      return `${studentName} shows a respectful attitude and willingness to learn. Greater attention during lessons and more consistent completion of assigned work will strengthen overall performance.`;
    }
    return `${studentName} displays satisfactory conduct and engages well with classmates. Steady effort and improved time management are encouraged for the next term.`;
  }
  if (average >= 50) {
    return `${studentName} is generally cooperative but needs to sustain focus and complete tasks on time. Regular revision, active participation, and asking for help when unsure are recommended.`;
  }
  if (weakCount >= 2 || average < 40) {
    return `${studentName} requires closer monitoring of classroom behaviour and study habits. Punctuality, attentiveness, and daily homework completion must improve with support from home and school.`;
  }
  if (strongCount > 0 && weakCount > 0) {
    return `${studentName} shows positive conduct in class but effort is uneven across subjects. Building consistent study routines and seeking guidance in weaker areas will help balance results.`;
  }
  return `${studentName} needs to improve self-discipline, participation, and completion of class responsibilities. With structured support and sustained effort, better outcomes are achievable.`;
}

export function buildClassTeacherRemarkFromCard(card: any): string {
  return generateClassTeacherRemark({
    studentName: card?.student?.name,
    overallAverage: card?.overallAverage,
    subjects: card?.subjects
  });
}
