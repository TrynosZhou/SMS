import { AppDataSource } from '../config/database';
import { Message } from '../entities/Message';
import { Settings } from '../entities/Settings';
import { User } from '../entities/User';
import {
  AdmissionApplication,
  AdmissionApplicationStatus,
} from '../entities/AdmissionApplication';
import { sendTransactionalEmail } from './mailer';

function portalBaseUrl(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/$/, '');
}

function statusLabel(status: AdmissionApplicationStatus): string {
  const map: Record<string, string> = {
    pending: 'Pending',
    under_review: 'Under review',
    accepted: 'Accepted',
    rejected: 'Rejected',
  };
  return map[status] || status;
}

function resolveApplicantEmail(app: AdmissionApplication): string | null {
  const direct = String(app.email || app.guardianEmail || '').trim();
  if (direct && direct.includes('@')) return direct;
  return null;
}

async function resolveApplicantEmailFromUser(app: AdmissionApplication): Promise<string | null> {
  const fromApp = resolveApplicantEmail(app);
  if (fromApp) return fromApp;
  const userId = app.applicantUserId || app.parentUserId;
  if (!userId) return null;
  const user = await AppDataSource.getRepository(User).findOne({ where: { id: userId } });
  const email = String(user?.email || '').trim();
  return email.includes('@') ? email : null;
}

async function getSchoolName(): Promise<string> {
  try {
    const settings = await AppDataSource.getRepository(Settings).findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });
    return String(settings?.schoolName || 'School').trim() || 'School';
  } catch {
    return 'School';
  }
}

async function getSchoolNotifyEmail(): Promise<string | null> {
  try {
    const settings = await AppDataSource.getRepository(Settings).findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });
    const e = String(settings?.schoolEmail || '').trim();
    return e.includes('@') ? e : null;
  } catch {
    return null;
  }
}

export async function notifyAdminsAdmissionSubmitted(app: AdmissionApplication): Promise<void> {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  const messageRepository = AppDataSource.getRepository(Message);
  const applicantName = `${app.firstName} ${app.lastName}`.trim();
  const typeLabel = app.applicationType === 'transfer' ? 'Transfer' : 'New admission';

  const notice = messageRepository.create({
    subject: `New admission application — ${app.applicationNumber}`,
    message:
      `A new online admission application was submitted.\n\n` +
      `Reference: ${app.applicationNumber}\n` +
      `Applicant: ${applicantName}\n` +
      `Type: ${typeLabel}\n` +
      `Grade/class: ${app.gradeApplyingFor || app.classApplyingFor?.name || '—'}\n` +
      `Guardian: ${app.guardianName || '—'} (${app.guardianPhone || '—'})\n\n` +
      `Review it under Admin → Registration → Admissions.`,
    recipients: 'admin',
    senderName: applicantName,
    isRead: false,
    status: 'sent',
  });
  await messageRepository.save(notice);

  const schoolEmail = await getSchoolNotifyEmail();
  if (schoolEmail) {
    const schoolName = await getSchoolName();
    const adminUrl = `${portalBaseUrl()}/admin/admissions`;
    await sendTransactionalEmail(
      schoolEmail,
      `[${schoolName}] New admission application ${app.applicationNumber}`,
      `New application from ${applicantName} (${typeLabel}). Review: ${adminUrl}`,
      `<p>A new admission application was submitted.</p>
       <p><strong>${applicantName}</strong> — ${typeLabel}<br/>Reference: ${app.applicationNumber}</p>
       <p><a href="${adminUrl}">Open admissions review</a></p>`
    );
  }
}

export async function notifyApplicantApplicationReceived(app: AdmissionApplication): Promise<void> {
  const to = await resolveApplicantEmailFromUser(app);
  if (!to) return;
  const schoolName = await getSchoolName();
  const portalUrl = `${portalBaseUrl()}/admissions/status/${app.id}`;
  const subject = `${schoolName} — application received (${app.applicationNumber})`;
  const text =
    `Dear ${app.firstName} ${app.lastName},\n\n` +
    `We received your admission application (${app.applicationNumber}). ` +
    `Status: Pending review.\n\nTrack your application: ${portalUrl}\n`;
  const html = `
    <p>Dear ${app.firstName} ${app.lastName},</p>
    <p>Thank you — we received your admission application <strong>${app.applicationNumber}</strong>.</p>
    <p>Current status: <strong>Pending review</strong>.</p>
    <p><a href="${portalUrl}">View application status</a></p>
    <p>— ${schoolName}</p>`;
  const result = await sendTransactionalEmail(to, subject, text, html);
  if (!result.ok) {
    console.warn('[Admissions] Applicant receipt email not sent:', result.error);
  }
}

export async function notifyApplicantStatusChange(
  app: AdmissionApplication,
  previousStatus?: AdmissionApplicationStatus
): Promise<void> {
  if (previousStatus && previousStatus === app.status) return;
  const to = await resolveApplicantEmailFromUser(app);
  if (!to) return;
  const schoolName = await getSchoolName();
  const portalUrl = `${portalBaseUrl()}/admissions/status/${app.id}`;
  const label = statusLabel(app.status);
  const subject = `${schoolName} — application update (${app.applicationNumber})`;
  let extra = '';
  if (app.reviewNotes) {
    extra = `\n\nMessage from the school:\n${app.reviewNotes}`;
  }
  const text =
    `Dear ${app.firstName} ${app.lastName},\n\n` +
    `Your application ${app.applicationNumber} is now: ${label}.${extra}\n\n` +
    `Details: ${portalUrl}\n`;
  const html = `
    <p>Dear ${app.firstName} ${app.lastName},</p>
    <p>Your application <strong>${app.applicationNumber}</strong> status is now: <strong>${label}</strong>.</p>
    ${app.reviewNotes ? `<p><em>${app.reviewNotes.replace(/</g, '&lt;')}</em></p>` : ''}
    <p><a href="${portalUrl}">View application</a></p>
    <p>— ${schoolName}</p>`;
  const result = await sendTransactionalEmail(to, subject, text, html);
  if (!result.ok) {
    console.warn('[Admissions] Status email not sent:', result.error);
  }
}

export async function notifyApplicantEnrolled(
  app: AdmissionApplication,
  studentNumber: string
): Promise<void> {
  const to = await resolveApplicantEmailFromUser(app);
  if (!to) return;
  const schoolName = await getSchoolName();
  const subject = `${schoolName} — enrolled (${studentNumber})`;
  const text =
    `Dear ${app.firstName} ${app.lastName},\n\n` +
    `Congratulations! Your admission application ${app.applicationNumber} has been accepted and ` +
    `you have been enrolled as a student.\n\nStudent ID: ${studentNumber}\n\n` +
    `You may now sign up for a student portal account using this Student ID.\n`;
  const html = `
    <p>Dear ${app.firstName} ${app.lastName},</p>
    <p>Your application <strong>${app.applicationNumber}</strong> is complete. You are enrolled at ${schoolName}.</p>
    <p><strong>Student ID:</strong> ${studentNumber}</p>
    <p>Use this ID on the login page (Sign Up → Student) to create your portal password.</p>
    <p>— ${schoolName}</p>`;
  await sendTransactionalEmail(to, subject, text, html);
}
