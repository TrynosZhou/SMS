import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Exam, ExamType } from '../entities/Exam';
import { Settings } from '../entities/Settings';
import { Student } from '../entities/Student';
import { Parent } from '../entities/Parent';
import { ParentStudent } from '../entities/ParentStudent';
import { Teacher } from '../entities/Teacher';
import { Class } from '../entities/Class';
import {
  isWhatsAppConfigured,
  normalizeWhatsAppRecipient,
  sendWhatsAppMessage,
  sleep,
  whatsAppSendDelayMs
} from './whatsappService';

export interface ResultsNotificationSummary {
  enabled: boolean;
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  recipients: number;
}

type RecipientKind = 'parent' | 'student' | 'teacher' | 'administrator';

interface RecipientEntry {
  phone: string;
  kinds: Set<RecipientKind>;
  displayName?: string;
}

function examTypeLabel(type: ExamType | string): string {
  const t = String(type || '').toLowerCase();
  if (t === ExamType.MID_TERM || t === 'mid_term') return 'Mid-Term';
  if (t === ExamType.END_TERM || t === 'end_term') return 'End of Term';
  if (t === ExamType.ASSIGNMENT || t === 'assignment') return 'Assignment';
  if (t === ExamType.QUIZ || t === 'quiz') return 'Quiz';
  return String(type || 'Exam');
}

function isResultsNotificationEnabled(settings: Settings | null): boolean {
  return settings?.notificationSettings?.sms?.reportCardReady === true;
}

function parseAdminPhonesFromEnv(): string[] {
  const raw = String(process.env.WHATSAPP_ADMIN_PHONES || '').trim();
  if (!raw) return [];
  return raw
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function parseAdminPhonesFromSettings(settings: Settings | null): string[] {
  const fromSettings = settings?.notificationSettings?.whatsapp?.adminPhones;
  if (!Array.isArray(fromSettings)) return [];
  return fromSettings.map((p) => String(p || '').trim()).filter(Boolean);
}

function addRecipient(
  map: Map<string, RecipientEntry>,
  phone: string | null | undefined,
  kind: RecipientKind,
  displayName?: string
): void {
  const normalized = normalizeWhatsAppRecipient(phone);
  if (!normalized) return;

  const existing = map.get(normalized);
  if (existing) {
    existing.kinds.add(kind);
    if (!existing.displayName && displayName) {
      existing.displayName = displayName;
    }
    return;
  }

  map.set(normalized, {
    phone: normalized,
    kinds: new Set([kind]),
    displayName
  });
}

function buildMessage(
  schoolName: string,
  examType: string,
  term: string,
  classNames: string[],
  entry: RecipientEntry
): string {
  const typeLabel = examTypeLabel(examType);
  const termLabel = term || 'the current term';
  const classHint =
    classNames.length === 1
      ? classNames[0]
      : classNames.length > 1
        ? `${classNames.length} classes`
        : 'your class';

  const greeting = entry.displayName ? `Dear ${entry.displayName},` : 'Hello,';

  if (entry.kinds.has('administrator')) {
    return (
      `${greeting}\n\n` +
      `${schoolName}: ${typeLabel} results for ${termLabel} have been published` +
      (classNames.length ? ` (${classHint}).` : '.') +
      `\n\nLog in to the School Management System to review.`
    );
  }

  if (entry.kinds.has('teacher')) {
    return (
      `${greeting}\n\n` +
      `${schoolName}: ${typeLabel} results for ${termLabel} have been published for ${classHint}. ` +
      `Marks are now visible to students and parents.\n\n` +
      `Please log in to the portal to view.`
    );
  }

  if (entry.kinds.has('parent')) {
    return (
      `${greeting}\n\n` +
      `${schoolName}: ${typeLabel} results for ${termLabel} have been published and are now available on the portal.\n\n` +
      `Please log in to view your child's report.`
    );
  }

  return (
    `${greeting}\n\n` +
    `${schoolName}: Your ${typeLabel} results for ${termLabel} have been published and are now available on the portal.\n\n` +
    `Please log in to view your report.`
  );
}

async function collectRecipients(
  classIds: string[],
  settings: Settings | null
): Promise<Map<string, RecipientEntry>> {
  const recipients = new Map<string, RecipientEntry>();

  if (classIds.length === 0) {
    return recipients;
  }

  const studentRepo = AppDataSource.getRepository(Student);
  const parentStudentRepo = AppDataSource.getRepository(ParentStudent);
  const classRepo = AppDataSource.getRepository(Class);
  const teacherRepo = AppDataSource.getRepository(Teacher);

  const students = await studentRepo.find({
    where: { classId: In(classIds), isActive: true },
    select: ['id', 'firstName', 'lastName', 'phoneNumber', 'contactNumber']
  });

  const studentIds = students.map((s) => s.id);

  for (const student of students) {
    const name = `${student.firstName || ''} ${student.lastName || ''}`.trim();
    addRecipient(recipients, student.contactNumber || student.phoneNumber, 'student', name || undefined);
  }

  if (studentIds.length > 0) {
    const links = await parentStudentRepo.find({
      where: { studentId: In(studentIds) },
      relations: ['parent']
    });

    for (const link of links) {
      const parent = link.parent as Parent | undefined;
      if (!parent) continue;
      const name = `${parent.firstName || ''} ${parent.lastName || ''}`.trim();
      addRecipient(recipients, parent.phoneNumber, 'parent', name || undefined);
    }
  }

  const classes = await classRepo.find({
    where: { id: In(classIds) },
    relations: ['teachers']
  });

  const teacherIds = new Set<string>();
  for (const cls of classes) {
    if (cls.classTeacher1Id) teacherIds.add(cls.classTeacher1Id);
    if (cls.classTeacher2Id) teacherIds.add(cls.classTeacher2Id);
    for (const t of cls.teachers || []) {
      if (t?.id) teacherIds.add(t.id);
    }
  }

  if (teacherIds.size > 0) {
    const teachers = await teacherRepo.find({
      where: { id: In([...teacherIds]), isActive: true },
      select: ['id', 'firstName', 'lastName', 'phoneNumber']
    });

    for (const teacher of teachers) {
      const name = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
      addRecipient(recipients, teacher.phoneNumber, 'teacher', name || undefined);
    }
  }

  const adminPhones = [
    ...parseAdminPhonesFromSettings(settings),
    ...parseAdminPhonesFromEnv(),
    settings?.schoolPhone || ''
  ];

  for (const phone of adminPhones) {
    addRecipient(recipients, phone, 'administrator');
  }

}

/**
 * Send WhatsApp notifications when exam results are published.
 * Respects Settings → Notifications → "Report Card Ready" toggle.
 */
export async function notifyResultsPublished(
  publishedExams: Exam[],
  settings: Settings | null
): Promise<ResultsNotificationSummary> {
  const summary: ResultsNotificationSummary = {
    enabled: isResultsNotificationEnabled(settings),
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    recipients: 0
  };

  if (!summary.enabled) {
    return summary;
  }

  if (!publishedExams.length) {
    return summary;
  }

  const classIds = [...new Set(publishedExams.map((e) => e.classId).filter(Boolean))];
  const examType = publishedExams[0].type;
  const term = String(publishedExams[0].term || '').trim();

  const classRepo = AppDataSource.getRepository(Class);
  const classes = classIds.length
    ? await classRepo.find({ where: { id: In(classIds) }, select: ['id', 'name'] })
    : [];
  const classNames = classes.map((c) => c.name).filter(Boolean);

  const schoolName = String(settings?.schoolName || 'School').trim() || 'School';
  const recipientMap = await collectRecipients(classIds, settings);
  summary.recipients = recipientMap.size;

  if (recipientMap.size === 0) {
    if (!isWhatsAppConfigured()) {
      console.info('[Results notification] No recipients with valid phone numbers.');
    }
    return summary;
  }

  const delay = whatsAppSendDelayMs();

  for (const entry of recipientMap.values()) {
    summary.attempted += 1;
    const message = buildMessage(schoolName, examType, term, classNames, entry);
    const result = await sendWhatsAppMessage(entry.phone, message);

    if (result.skipped) {
      summary.skipped += 1;
    } else if (result.ok) {
      summary.sent += 1;
    } else {
      summary.failed += 1;
      console.warn(`[WhatsApp] Failed to notify ${entry.phone}: ${result.error}`);
    }

    if (delay > 0) {
      await sleep(delay);
    }
  }

  console.info(
    `[Results notification] ${examTypeLabel(examType)} / ${term}: ` +
      `${summary.sent} sent, ${summary.failed} failed, ${summary.skipped} skipped (dry-run), ` +
      `${summary.recipients} recipients`
  );

  return summary;
}

/** Fire-and-forget wrapper — does not block the publish API response. */
export function queueResultsPublishedNotifications(publishedExams: Exam[]): void {
  void (async () => {
    try {
      if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
      }
      const settingsRepo = AppDataSource.getRepository(Settings);
      const settings = await settingsRepo.find({ take: 1, order: { createdAt: 'ASC' } }).then((rows) => rows[0] || null);
      await notifyResultsPublished(publishedExams, settings);
    } catch (err) {
      console.error('[Results notification] Unexpected error:', err);
    }
  })();
}
