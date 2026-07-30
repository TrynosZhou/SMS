import axios from 'axios';
import { isOpenAiConfigured } from './chatbotOpenAi.service';

export type ReportCardRemarkType = 'classTeacher' | 'headmaster';

export interface ReportCardAiSubject {
  name?: string;
  subject?: string;
  subjectName?: string;
  percentage?: string | number;
  score?: number;
  maxScore?: number;
  grade?: string;
}

export interface GenerateReportCardRemarkInput {
  remarkType: ReportCardRemarkType;
  studentName: string;
  className?: string;
  term?: string;
  examType?: string;
  overallAverage?: string | number;
  position?: string | number;
  totalStudents?: string | number;
  headmasterName?: string;
  subjects?: ReportCardAiSubject[];
  /** How many alternative remarks to return (default 5, clamped 3–6). */
  count?: number;
}

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_TOKENS = Math.min(Number(process.env.OPENAI_MAX_TOKENS || 700), 900);

function subjectLabel(sub: ReportCardAiSubject): string {
  return String(sub.subject || sub.name || sub.subjectName || 'Subject').trim();
}

function subjectPct(sub: ReportCardAiSubject): number | null {
  if (sub.percentage !== undefined && sub.percentage !== null && String(sub.percentage).trim() !== '') {
    const parsed = parseFloat(String(sub.percentage));
    if (!Number.isNaN(parsed)) return parsed;
  }
  const score = parseFloat(String(sub.score ?? ''));
  const max = parseFloat(String(sub.maxScore ?? ''));
  if (!Number.isNaN(score) && !Number.isNaN(max) && max > 0) {
    return (score / max) * 100;
  }
  return null;
}

function formatSubjects(subjects: ReportCardAiSubject[] | undefined): string {
  const rows = (subjects || [])
    .map((sub) => {
      const name = subjectLabel(sub);
      const pct = subjectPct(sub);
      const grade = String(sub.grade || '').trim();
      if (String(grade).toUpperCase() === 'N/A') return null;
      const pctText = pct === null ? 'n/a' : `${pct.toFixed(1)}%`;
      return `- ${name}: ${pctText}${grade ? ` (grade ${grade})` : ''}`;
    })
    .filter(Boolean);
  return rows.length ? rows.join('\n') : 'No assessed subject results provided.';
}

function buildSystemPrompt(remarkType: ReportCardRemarkType, headmasterName?: string, count = 5): string {
  const shared = `You write school report-card remarks.
Return ONLY a JSON object of the form {"remarks":["...","..."]} with exactly ${count} distinct strings.
Each remark must be 1–2 short sentences (max ~45 words), constructive, professional, and unique in wording.
Never invent attendance, medical, fee, or disciplinary incidents.
No markdown and no extra keys.`;

  if (remarkType === 'classTeacher') {
    return `${shared}
Focus: class teacher view — conduct, effort, participation, and study habits.
Address the learner by first name when a name is given.
Do not add a signature.`;
  }

  const signature = String(headmasterName || '').trim();
  return `${shared}
Focus: Head of School / Headmaster view — overall academic progress and motivation; mention weak subjects only if clearly below 50%.
${signature ? `End each remark with a short signature using exactly: "${signature}"` : 'Do not add a signature line.'}`;
}

function buildUserPrompt(input: GenerateReportCardRemarkInput, count: number): string {
  const avg =
    input.overallAverage === undefined || input.overallAverage === null || input.overallAverage === ''
      ? 'n/a'
      : String(input.overallAverage);
  const position =
    input.position !== undefined && input.position !== null && String(input.position).trim() !== ''
      ? String(input.position)
      : 'n/a';
  const total =
    input.totalStudents !== undefined && input.totalStudents !== null && String(input.totalStudents).trim() !== ''
      ? String(input.totalStudents)
      : 'n/a';
  const kind = input.remarkType === 'classTeacher' ? 'class teacher' : 'headmaster';

  return `Student: ${input.studentName || 'The learner'}
Class: ${input.className || 'n/a'}
Term: ${input.term || 'n/a'}
Exam: ${input.examType || 'n/a'}
Overall average: ${avg}
Class position: ${position} of ${total}

Subject results:
${formatSubjects(input.subjects)}

Return JSON: {"remarks":[ /* exactly ${count} alternative ${kind} remarks */ ]}`;
}

function normalizeRemark(text: string): string {
  let remark = String(text || '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (remark.length > 420) {
    remark = `${remark.slice(0, 417).trim()}…`;
  }
  return remark;
}

function parseRemarkAlternatives(raw: string, expected: number): string[] {
  const text = String(raw || '').trim();
  if (!text) return [];

  const tryParse = (candidate: string): string[] => {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === 'string' ? item : item?.remark || item?.text || ''))
          .map(normalizeRemark)
          .filter(Boolean);
      }
      if (parsed && Array.isArray(parsed.remarks)) {
        return parsed.remarks.map((item: any) => normalizeRemark(String(item))).filter(Boolean);
      }
    } catch {
      /* fall through */
    }
    return [];
  };

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let list = tryParse(fence ? fence[1].trim() : text);
  if (!list.length) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      list = tryParse(text.slice(start, end + 1));
    }
  }
  if (!list.length) {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start >= 0 && end > start) {
      list = tryParse(text.slice(start, end + 1));
    }
  }
  if (!list.length) {
    list = text
      .split(/\n+/)
      .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
      .map(normalizeRemark)
      .filter((line) => line.length > 20);
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const item of list) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique.slice(0, Math.max(expected, 3));
}

export { isOpenAiConfigured };

/** @deprecated Prefer generateReportCardRemarkAlternatives */
export async function generateReportCardRemark(
  input: GenerateReportCardRemarkInput
): Promise<{ remark: string; model: string }> {
  const { remarks, model } = await generateReportCardRemarkAlternatives(input);
  return { remark: remarks[0] || '', model };
}

export async function generateReportCardRemarkAlternatives(
  input: GenerateReportCardRemarkInput
): Promise<{ remarks: string[]; model: string }> {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const remarkType: ReportCardRemarkType =
    input.remarkType === 'headmaster' ? 'headmaster' : 'classTeacher';
  const count = Math.min(6, Math.max(3, Number(input.count) || 5));

  const url = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
  const model = DEFAULT_MODEL;

  const response = await axios.post(
    url,
    {
      model,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(remarkType, input.headmasterName, count),
        },
        {
          role: 'user',
          content: buildUserPrompt({ ...input, remarkType }, count),
        },
      ],
      temperature: 0.7,
      max_tokens: MAX_TOKENS,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    }
  );

  const content = String(response.data?.choices?.[0]?.message?.content || '').trim();
  const remarks = parseRemarkAlternatives(content, count);

  if (!remarks.length) {
    throw new Error('OpenAI returned no usable remark alternatives');
  }

  return { remarks, model };
}
