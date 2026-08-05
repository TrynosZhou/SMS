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

function hashSeed(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pickVariant(seed: string, variants: string[]): string {
  if (!variants.length) return '';
  return variants[hashSeed(seed) % variants.length];
}

function withSignature(text: string, signature: string): string {
  return signature ? `${text}${signature}` : text;
}

function subjectLabel(sub: HeadmasterRemarkSubject): string {
  return String(sub.subject || sub.name || sub.subjectName || '').trim();
}

/** Build a motivating, performance-based head's remark with the headmaster's name appended. */
export function generateHeadmasterRemark(input: HeadmasterRemarkInput): string {
  const headName = String(input.headmasterName || '').trim();
  const studentName = String(input.studentName || '').trim();
  const displayName = studentName || 'The learner';
  const namePart = studentName ? ` by ${studentName}` : '';
  const signature = headName ? `. ${headName}` : '';
  const seed = `${studentName}|${input.overallAverage}|${(input.subjects || []).length}`;

  const assessedSubjects = getAssessedSubjects(input.subjects);
  const subjectPercentages = assessedSubjects.map((sub) => getSubjectPercentage(sub));
  const failedSubjects = assessedSubjects.filter((sub) => getSubjectPercentage(sub) < 50);
  const allSubjectsUnder50 =
    assessedSubjects.length > 0 && subjectPercentages.every((pct) => pct < 50);
  const someSubjectsUnder50 =
    assessedSubjects.length > 0 && failedSubjects.length > 0 && !allSubjectsUnder50;
  const average = parseAverage(input.overallAverage);

  // Reserved ONLY when every assessed subject is below 50%.
  if (allSubjectsUnder50) {
    const urgentVariants = [
      `The learner requires urgent and sustained support${namePart}. Close follow-up and serious commitment are essential for improvement`,
      `Every subject result is below 50%${namePart ? ` for ${studentName}` : ''}. With focused support, regular practice, and close follow-up, meaningful improvement is still achievable`,
      `Results across all subjects are below 50%${namePart}. Sustained effort, guidance, and a positive learning plan will help build stronger outcomes`
    ];
    return withSignature(pickVariant(seed, urgentVariants), signature);
  }

  if (someSubjectsUnder50) {
    const weakNames = failedSubjects.map(subjectLabel).filter(Boolean).join(', ');
    const strongCount = assessedSubjects.length - failedSubjects.length;
    const partialVariants = [
      `A promising overall effort${namePart}. With extra focus and encouragement in ${weakNames}, ${displayName} can achieve a more balanced and confident profile`,
      `${displayName} shows real potential${namePart ? '' : ''}${namePart}. Continued dedication in ${weakNames}, alongside strengths in other areas, will lead to stronger results`,
      `Good progress is visible${namePart}. Targeted revision in ${weakNames} will help ${displayName} turn steady effort into even better achievements`,
      `${displayName} is capable of excellent work${namePart ? '' : ''}${namePart}. Building consistency in ${weakNames} will complement ${strongCount > 0 ? 'the solid performance already shown elsewhere' : 'a growing work ethic'}`
    ];
    return withSignature(pickVariant(`${seed}|partial`, partialVariants), signature);
  }

  if (average >= 80) {
    const variants = [
      `Excellent performance${namePart}. Keep up the outstanding work and continue inspiring others with your dedication`,
      `An exceptional result${namePart}. Your discipline, focus, and commitment are truly commendable—maintain this excellent standard`,
      `Outstanding achievement${namePart}. You have shown remarkable ability and consistency; keep reaching for even greater heights`,
      `Superb performance${namePart}. Your hard work is clearly paying off—continue with the same positive attitude and excellence`
    ];
    return withSignature(pickVariant(`${seed}|80`, variants), signature);
  }

  if (average >= 70) {
    const variants = [
      `Very good performance${namePart}. Maintain this strong level of effort and you will continue to excel`,
      `A commendable performance${namePart}. Your steady application and positive attitude are building a bright academic future`,
      `Well done${namePart}. You are performing strongly—keep nurturing your talents and aiming higher`,
      `Impressive results${namePart}. With continued focus and confidence, even greater success is within reach`
    ];
    return withSignature(pickVariant(`${seed}|70`, variants), signature);
  }

  if (average >= 60) {
    const variants = [
      `Good results${namePart}. Continued hard work and consistency will yield even better outcomes`,
      `A solid performance${namePart}. Keep building on this foundation with determination and you will go far`,
      `Encouraging progress${namePart}. Your effort is showing—stay motivated and keep pushing forward`,
      `Well-deserved success${namePart}. Maintain your positive habits and your results will continue to improve`
    ];
    return withSignature(pickVariant(`${seed}|60`, variants), signature);
  }

  if (average >= 50) {
    const variants = [
      `Satisfactory performance${namePart}. With greater consistency and focus, you can move confidently to the next level`,
      `A fair effort${namePart}. Keep working steadily—your potential is clear and improvement is within your reach`,
      `Promising results${namePart}. Stay committed to your studies and you will see rewarding progress`,
      `Good foundation${namePart}. Build on this with regular revision and a positive mindset for stronger outcomes`
    ];
    return withSignature(pickVariant(`${seed}|50`, variants), signature);
  }

  if (average >= 40) {
    const variants = [
      `Encouraging signs of progress${namePart}. With sustained effort and support, stronger results are ahead`,
      `${displayName} has ability and room to grow${namePart ? '' : ''}${namePart}. Keep working positively—improvement is achievable step by step`,
      `A developing performance${namePart}. Stay focused, ask for help when needed, and believe in your capacity to improve`,
      `There is clear potential${namePart}. Regular study habits and a can-do attitude will lead to better achievements`
    ];
    return withSignature(pickVariant(`${seed}|40`, variants), signature);
  }

  const growthVariants = [
    `Keep believing in yourself${namePart}. With consistent effort, guidance, and determination, you can make meaningful progress`,
    `${displayName} can rise to the challenge${namePart ? '' : ''}${namePart}. Focus on small daily improvements and your results will strengthen over time`,
    `Every step forward counts${namePart}. Stay positive, work steadily, and seek support where needed—success is built gradually`,
    `Your journey continues${namePart}. With patience, hard work, and encouragement, brighter results are absolutely possible`
  ];
  return withSignature(pickVariant(`${seed}|growth`, growthVariants), signature);
}

/** Build a performance-based class teacher remark (no signature). */
export function generateClassTeacherRemark(input: HeadmasterRemarkInput): string {
  const studentName = String(input.studentName || '').trim();
  const displayName = studentName || 'The learner';
  const firstName = studentName ? studentName.split(/\s+/)[0] : displayName;
  const seed = `${studentName}|ct|${input.overallAverage}|${(input.subjects || []).length}`;

  const assessedSubjects = getAssessedSubjects(input.subjects);
  const failedSubjects = assessedSubjects.filter((sub) => getSubjectPercentage(sub) < 50);
  const allSubjectsUnder50 =
    assessedSubjects.length > 0 &&
    assessedSubjects.every((sub) => getSubjectPercentage(sub) < 50);
  const average = parseAverage(input.overallAverage);

  if (allSubjectsUnder50) {
    return pickVariant(seed, [
      `${firstName} needs consistent support and closer supervision. Greater focus on homework and regular revision will help lift performance across subjects.`,
      `${displayName} must apply more effort in class and at home. With steady practice and guidance, clearer progress is within reach.`,
      `${firstName} shows need for sustained academic support. Encouraging regular study habits and asking for help early will make a real difference.`
    ]);
  }

  if (failedSubjects.length > 0) {
    const weakNames = failedSubjects.map(subjectLabel).filter(Boolean).join(', ');
    return pickVariant(`${seed}|weak`, [
      `${firstName} works well in several areas but should strengthen ${weakNames}. Extra revision and class participation will help balance results.`,
      `${displayName} shows promise overall. Targeted practice in ${weakNames} and continued effort elsewhere will improve the term profile.`,
      `${firstName} is capable and engaged in many lessons. Focusing more carefully on ${weakNames} will bring more consistent grades.`
    ]);
  }

  if (average >= 80) {
    return pickVariant(`${seed}|80`, [
      `${firstName} has shown excellent effort, focus, and participation. Keep up this outstanding work ethic and positive classroom attitude.`,
      `${displayName} is a highly committed learner. Continued diligence and helpful class engagement set a fine example for peers.`,
      `${firstName} demonstrates strong study habits and keen interest in learning. Maintain this excellent standard throughout the year.`
    ]);
  }

  if (average >= 70) {
    return pickVariant(`${seed}|70`, [
      `${firstName} has worked hard and participates positively in class. Maintain this strong effort to keep improving.`,
      `${displayName} shows good commitment and steady application. Continue revising regularly and aiming for even higher standards.`,
      `${firstName} is attentive and reliable. With the same focus and determination, further progress is expected.`
    ]);
  }

  if (average >= 60) {
    return pickVariant(`${seed}|60`, [
      `${firstName} has made solid progress and shows a positive attitude. Consistent homework and revision will yield stronger results.`,
      `${displayName} works steadily in class. Keep building good study habits and confidence for the next assessment.`,
      `${firstName} is cooperative and improving. Continued effort and active participation will support further gains.`
    ]);
  }

  if (average >= 50) {
    return pickVariant(`${seed}|50`, [
      `${firstName} has achieved a fair standard. Greater consistency in revision and classwork will help move to the next level.`,
      `${displayName} shows potential with more focused effort. Regular practice and asking questions will strengthen performance.`,
      `${firstName} is making acceptable progress. Stay committed to homework and classroom tasks for better outcomes.`
    ]);
  }

  return pickVariant(`${seed}|grow`, [
    `${firstName} can improve with sustained effort and support. Focus on daily revision and completing all assigned work carefully.`,
    `${displayName} needs to build stronger study routines. With encouragement and steady practice, better results are achievable.`,
    `${firstName} is capable of stronger work. Stay positive, seek help when unsure, and keep practising regularly.`
  ]);
}

/** Use a saved remark when present; otherwise generate from performance data. */
export function resolveHeadmasterRemark(
  saved: string | null | undefined,
  input: HeadmasterRemarkInput
): string | null {
  const trimmed = String(saved || '').trim();
  if (trimmed) return trimmed;
  const generated = generateHeadmasterRemark(input);
  return generated || null;
}

/** Use a saved class-teacher remark when present; otherwise generate from performance. */
export function resolveClassTeacherRemark(
  saved: string | null | undefined,
  input: HeadmasterRemarkInput
): string | null {
  const trimmed = String(saved || '').trim();
  if (trimmed) return trimmed;
  const generated = generateClassTeacherRemark(input);
  return generated || null;
}
