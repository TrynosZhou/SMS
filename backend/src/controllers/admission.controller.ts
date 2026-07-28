import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { User, UserRole } from '../entities/User';
import {
  AdmissionApplication,
  AdmissionApplicationStatus,
  AdmissionApplicationType,
  AdmissionSubmittedBy,
} from '../entities/AdmissionApplication';
import { AdmissionDocument, AdmissionDocumentType } from '../entities/AdmissionDocument';
import { Class } from '../entities/Class';
import { admissionPublicPath } from '../utils/admissionUpload';
import {
  notifyAdminsAdmissionSubmitted,
  notifyApplicantApplicationReceived,
  notifyApplicantStatusChange,
} from '../utils/admissionNotifications';
import { enrollApplicationAsStudent } from '../services/admissionEnrollment.service';
import {
  isWhatsAppConfigured,
  normalizeWhatsAppRecipient,
  sendWhatsAppMessage,
  buildWhatsAppWebUrl,
} from '../utils/whatsappService';

const APP_RELATIONS = ['documents', 'classApplyingFor', 'enrolledStudent'] as const;

const STAFF_ROLES = new Set<string>([
  UserRole.ADMIN,
  UserRole.SUPERADMIN,
  UserRole.DIRECTOR,
  UserRole.HEADMASTER,
  UserRole.DEPUTY_HEADMASTER,
]);

function isStaff(user: User): boolean {
  return STAFF_ROLES.has(user.role);
}

function canAccessApplication(user: User, app: AdmissionApplication): boolean {
  if (isStaff(user)) return true;
  if (user.role === UserRole.APPLICANT && app.applicantUserId === user.id) return true;
  if (user.role === UserRole.PARENT && app.parentUserId === user.id) return true;
  return false;
}

async function nextApplicationNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const repo = AppDataSource.getRepository(AdmissionApplication);
  const count = await repo
    .createQueryBuilder('a')
    .where('a.applicationNumber LIKE :prefix', { prefix: `ADM-${year}-%` })
    .getCount();
  const seq = String(count + 1).padStart(4, '0');
  return `ADM-${year}-${seq}`;
}

function parseApplicationType(raw: unknown): AdmissionApplicationType {
  const v = String(raw || '').toLowerCase();
  if (v === 'transfer') return AdmissionApplicationType.TRANSFER;
  return AdmissionApplicationType.NEW_ADMISSION;
}

function parseBodyFields(body: Record<string, unknown>) {
  return {
    firstName: String(body.firstName || '').trim(),
    lastName: String(body.lastName || '').trim(),
    dateOfBirth: body.dateOfBirth ? String(body.dateOfBirth).trim() : null,
    gender: body.gender ? String(body.gender).trim() : null,
    address: body.address ? String(body.address).trim() : null,
    phone: body.phone ? String(body.phone).trim() : null,
    email: body.email ? String(body.email).trim() : null,
    previousSchool: body.previousSchool ? String(body.previousSchool).trim() : null,
    classApplyingForId: body.classApplyingForId ? String(body.classApplyingForId).trim() : null,
    gradeApplyingFor: body.gradeApplyingFor ? String(body.gradeApplyingFor).trim() : null,
    guardianName: body.guardianName ? String(body.guardianName).trim() : null,
    guardianRelationship: body.guardianRelationship ? String(body.guardianRelationship).trim() : null,
    guardianPhone: body.guardianPhone ? String(body.guardianPhone).trim() : null,
    guardianEmail: body.guardianEmail ? String(body.guardianEmail).trim() : null,
    guardianAddress: body.guardianAddress ? String(body.guardianAddress).trim() : null,
    academicNotes: body.academicNotes ? String(body.academicNotes).trim() : null,
    applicationType: parseApplicationType(body.applicationType),
  };
}

function validateRequiredFields(fields: ReturnType<typeof parseBodyFields>): string | null {
  if (!fields.firstName || !fields.lastName) return 'First name and last name are required';
  if (!fields.dateOfBirth) return 'Date of birth is required';
  if (!fields.gender) return 'Gender is required';
  if (!fields.address) return 'Address is required';
  if (!fields.phone) return 'Contact phone is required';
  if (!fields.gradeApplyingFor && !fields.classApplyingForId) {
    return 'Grade or class applying for is required';
  }
  if (!fields.guardianName || !fields.guardianPhone) {
    return 'Guardian name and contact phone are required';
  }
  if (fields.applicationType === AdmissionApplicationType.TRANSFER && !fields.previousSchool) {
    return 'Previous school is required for transfer applications';
  }
  return null;
}

type UploadedMap = Record<string, Express.Multer.File[] | undefined>;

function collectFilesFromRequest(req: AuthRequest): UploadedMap {
  return (req.files as UploadedMap) || {};
}

async function persistDocuments(
  applicationId: string,
  files: UploadedMap,
  replaceTypes?: AdmissionDocumentType[]
): Promise<void> {
  const docRepo = AppDataSource.getRepository(AdmissionDocument);
  const mapping: { field: string; type: AdmissionDocumentType }[] = [
    { field: 'birthCertificate', type: AdmissionDocumentType.BIRTH_CERTIFICATE },
    { field: 'reportCard', type: AdmissionDocumentType.REPORT_CARD },
    { field: 'idPhoto', type: AdmissionDocumentType.ID_PHOTO },
    { field: 'medicalForm', type: AdmissionDocumentType.MEDICAL_FORM },
    { field: 'otherDocument', type: AdmissionDocumentType.OTHER },
  ];

  if (replaceTypes?.length) {
    const existing = await docRepo.find({ where: { applicationId } });
    for (const doc of existing) {
      if (replaceTypes.includes(doc.documentType)) {
        try {
          const full = path.join(__dirname, '../../', doc.storedPath.replace(/^\//, ''));
          if (fs.existsSync(full)) fs.unlinkSync(full);
        } catch {
          /* ignore */
        }
        await docRepo.remove(doc);
      }
    }
  }

  for (const { field, type } of mapping) {
    const list = files[field];
    if (!list?.length) continue;
    for (const file of list) {
      const storedPath = admissionPublicPath(path.basename(file.path));
      const row = docRepo.create({
        applicationId,
        documentType: type,
        originalFilename: file.originalname,
        storedPath,
        mimeType: file.mimetype,
        fileSize: file.size,
      });
      await docRepo.save(row);
    }
  }
}

function hasDocumentType(docs: AdmissionDocument[], type: AdmissionDocumentType): boolean {
  return docs.some((d) => d.documentType === type);
}

function validateDocumentsForSubmit(
  applicationType: AdmissionApplicationType,
  docs: AdmissionDocument[]
): string | null {
  if (!hasDocumentType(docs, AdmissionDocumentType.BIRTH_CERTIFICATE)) {
    return 'Certified copy of birth certificate is required';
  }
  if (
    applicationType === AdmissionApplicationType.TRANSFER &&
    !hasDocumentType(docs, AdmissionDocumentType.REPORT_CARD)
  ) {
    return 'Most recent term report card is required for transfer applications';
  }
  return null;
}

export const listMyApplications = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const repo = AppDataSource.getRepository(AdmissionApplication);
    let apps: AdmissionApplication[];

    if (isStaff(user)) {
      apps = await repo.find({
        relations: [...APP_RELATIONS],
        order: { createdAt: 'DESC' },
        take: 200,
      });
    } else if (user.role === UserRole.APPLICANT) {
      apps = await repo.find({
        where: { applicantUserId: user.id },
        relations: [...APP_RELATIONS],
        order: { createdAt: 'DESC' },
      });
    } else if (user.role === UserRole.PARENT) {
      apps = await repo.find({
        where: { parentUserId: user.id },
        relations: [...APP_RELATIONS],
        order: { createdAt: 'DESC' },
      });
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(apps);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Server error' });
  }
};

export const getApplication = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const repo = AppDataSource.getRepository(AdmissionApplication);
    const app = await repo.findOne({
      where: { id: req.params.id },
      relations: [...APP_RELATIONS],
    });
    if (!app) return res.status(404).json({ message: 'Application not found' });
    if (!canAccessApplication(user, app)) return res.status(403).json({ message: 'Access denied' });
    res.json(app);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Server error' });
  }
};

export const createApplication = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== UserRole.APPLICANT && user.role !== UserRole.PARENT) {
      return res.status(403).json({ message: 'Only applicants and parents can submit applications' });
    }

    const fields = parseBodyFields(req.body);
    const validationError = validateRequiredFields(fields);
    if (validationError) return res.status(400).json({ message: validationError });

    if (fields.classApplyingForId) {
      const cls = await AppDataSource.getRepository(Class).findOne({
        where: { id: fields.classApplyingForId },
      });
      if (!cls) return res.status(400).json({ message: 'Invalid class selected' });
    }

    const repo = AppDataSource.getRepository(AdmissionApplication);
    const applicationNumber = await nextApplicationNumber();

    const app = repo.create({
      applicationNumber,
      applicantUserId: user.role === UserRole.APPLICANT ? user.id : null,
      parentUserId: user.role === UserRole.PARENT ? user.id : null,
      submittedBy:
        user.role === UserRole.PARENT
          ? AdmissionSubmittedBy.PARENT
          : AdmissionSubmittedBy.APPLICANT,
      applicationType: fields.applicationType,
      status: AdmissionApplicationStatus.PENDING,
      firstName: fields.firstName,
      lastName: fields.lastName,
      dateOfBirth: fields.dateOfBirth,
      gender: fields.gender,
      address: fields.address,
      phone: fields.phone,
      email: fields.email || user.email || null,
      previousSchool: fields.previousSchool,
      classApplyingForId: fields.classApplyingForId,
      gradeApplyingFor: fields.gradeApplyingFor,
      guardianName: fields.guardianName,
      guardianRelationship: fields.guardianRelationship,
      guardianPhone: fields.guardianPhone,
      guardianEmail: fields.guardianEmail,
      guardianAddress: fields.guardianAddress,
      academicNotes: fields.academicNotes,
      submittedAt: new Date(),
    });

    await repo.save(app);
    await persistDocuments(app.id, collectFilesFromRequest(req));

    const withDocs = await repo.findOne({
      where: { id: app.id },
      relations: [...APP_RELATIONS],
    });
    const docErr = validateDocumentsForSubmit(app.applicationType, withDocs?.documents || []);
    if (docErr) {
      return res.status(201).json({
        message: `Application saved but documents incomplete: ${docErr}`,
        application: withDocs,
        documentsIncomplete: true,
      });
    }

    if (withDocs) {
      void notifyAdminsAdmissionSubmitted(withDocs).catch((err) =>
        console.warn('[Admissions] Admin notify failed:', err)
      );
      void notifyApplicantApplicationReceived(withDocs).catch((err) =>
        console.warn('[Admissions] Applicant receipt email failed:', err)
      );
    }

    res.status(201).json({ message: 'Application submitted successfully', application: withDocs });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Server error' });
  }
};

export const updateApplication = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const repo = AppDataSource.getRepository(AdmissionApplication);
    const app = await repo.findOne({
      where: { id: req.params.id },
      relations: ['documents'],
    });
    if (!app) return res.status(404).json({ message: 'Application not found' });
    if (!canAccessApplication(user, app)) return res.status(403).json({ message: 'Access denied' });
    if (!isStaff(user) && app.status !== AdmissionApplicationStatus.PENDING) {
      return res.status(400).json({ message: 'Only pending applications can be edited' });
    }

    const fields = parseBodyFields(req.body);
    const validationError = validateRequiredFields(fields);
    if (validationError) return res.status(400).json({ message: validationError });

    Object.assign(app, {
      applicationType: fields.applicationType,
      firstName: fields.firstName,
      lastName: fields.lastName,
      dateOfBirth: fields.dateOfBirth,
      gender: fields.gender,
      address: fields.address,
      phone: fields.phone,
      email: fields.email,
      previousSchool: fields.previousSchool,
      classApplyingForId: fields.classApplyingForId,
      gradeApplyingFor: fields.gradeApplyingFor,
      guardianName: fields.guardianName,
      guardianRelationship: fields.guardianRelationship,
      guardianPhone: fields.guardianPhone,
      guardianEmail: fields.guardianEmail,
      guardianAddress: fields.guardianAddress,
      academicNotes: fields.academicNotes,
    });

    await repo.save(app);

    const files = collectFilesFromRequest(req);
    const typesToReplace: AdmissionDocumentType[] = [];
    if (files.birthCertificate?.length) typesToReplace.push(AdmissionDocumentType.BIRTH_CERTIFICATE);
    if (files.reportCard?.length) typesToReplace.push(AdmissionDocumentType.REPORT_CARD);
    if (files.idPhoto?.length) typesToReplace.push(AdmissionDocumentType.ID_PHOTO);
    if (files.medicalForm?.length) typesToReplace.push(AdmissionDocumentType.MEDICAL_FORM);
    if (files.otherDocument?.length) typesToReplace.push(AdmissionDocumentType.OTHER);
    if (typesToReplace.length) await persistDocuments(app.id, files, typesToReplace);

    const updated = await repo.findOne({
      where: { id: app.id },
      relations: [...APP_RELATIONS],
    });
    res.json({ message: 'Application updated', application: updated });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Server error' });
  }
};

export const updateApplicationStatus = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!isStaff(user)) return res.status(403).json({ message: 'Access denied' });

    const { status, reviewNotes } = req.body;
    const allowed = Object.values(AdmissionApplicationStatus);
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const repo = AppDataSource.getRepository(AdmissionApplication);
    const app = await repo.findOne({ where: { id: req.params.id }, relations: ['documents'] });
    if (!app) return res.status(404).json({ message: 'Application not found' });

    const previousStatus = app.status;
    app.status = status;
    app.reviewNotes = reviewNotes ? String(reviewNotes).trim() : app.reviewNotes;
    app.reviewedByUserId = user.id;
    app.reviewedAt = new Date();
    await repo.save(app);

    const full = await repo.findOne({
      where: { id: app.id },
      relations: [...APP_RELATIONS],
    });
    if (full) {
      void notifyApplicantStatusChange(full, previousStatus).catch((err) =>
        console.warn('[Admissions] Status email failed:', err)
      );
    }
    res.json({ message: 'Status updated', application: full });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Server error' });
  }
};

export const enrollFromApplication = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!isStaff(user)) return res.status(403).json({ message: 'Access denied' });

    const { student, application } = await enrollApplicationAsStudent(req.params.id);
    res.json({
      message: 'Student enrolled successfully',
      student: {
        id: student.id,
        studentNumber: student.studentNumber,
        firstName: student.firstName,
        lastName: student.lastName,
      },
      application,
    });
  } catch (e: any) {
    const msg = e.message || 'Server error';
    const code = msg.includes('not found') ? 404 : msg.includes('Only accepted') ? 400 : 500;
    res.status(code).json({ message: msg });
  }
};

export const sendWhatsAppToApplicant = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!isStaff(user)) return res.status(403).json({ message: 'Access denied' });

    const message = String(req.body?.message || '').trim();
    if (!message) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    const repo = AppDataSource.getRepository(AdmissionApplication);
    const app = await repo.findOne({ where: { id: req.params.id } });
    if (!app) return res.status(404).json({ message: 'Application not found' });

    const phoneRaw = String(app.guardianPhone || app.phone || '').trim();
    if (!phoneRaw) {
      return res.status(400).json({ message: 'No guardian or applicant phone number on this application' });
    }

    const normalized = normalizeWhatsAppRecipient(phoneRaw);
    if (!normalized) {
      return res.status(400).json({ message: 'Phone number on file is not valid for WhatsApp' });
    }

    const result = await sendWhatsAppMessage(phoneRaw, message);

    app.reviewNotes = message;
    await repo.save(app);

    const fallbackUrl = buildWhatsAppWebUrl(phoneRaw, message);
    const full = await repo.findOne({
      where: { id: app.id },
      relations: [...APP_RELATIONS],
    });

    if (!result.ok) {
      return res.json({
        sent: false,
        message:
          (result.error || 'WhatsApp Cloud API could not send the message.') +
          (fallbackUrl ? ' You can open WhatsApp manually using the link provided.' : ''),
        apiError: result.error,
        fallbackUrl,
        configured: isWhatsAppConfigured(),
        application: full,
      });
    }

    const dryRun = result.dryRun || result.skipped;
    const responseMessage = dryRun
      ? 'WhatsApp dry-run: message logged on server (not delivered). Configure WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID for automatic sends.'
      : 'WhatsApp message sent successfully';

    res.json({
      sent: !dryRun,
      message: responseMessage,
      dryRun,
      fallbackUrl: dryRun ? fallbackUrl : null,
      configured: isWhatsAppConfigured(),
      to: phoneRaw,
      application: full,
    });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Server error' });
  }
};

export const listApplicationsAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!isStaff(user)) return res.status(403).json({ message: 'Access denied' });

    const status = req.query.status ? String(req.query.status) : undefined;
    const repo = AppDataSource.getRepository(AdmissionApplication);
    const qb = repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.documents', 'documents')
      .leftJoinAndSelect('a.classApplyingFor', 'classApplyingFor')
      .leftJoinAndSelect('a.enrolledStudent', 'enrolledStudent')
      .orderBy('a.createdAt', 'DESC');

    if (status && status !== 'all') {
      qb.andWhere('a.status = :status', { status });
    }

    const search = String(req.query.search || '').trim();
    if (search) {
      qb.andWhere(
        `(a.firstName ILIKE :q OR a.lastName ILIKE :q OR a.applicationNumber ILIKE :q OR a.email ILIKE :q)`,
        { q: `%${search}%` }
      );
    }

    const apps = await qb.take(500).getMany();
    res.json(apps);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Server error' });
  }
};

export const listClassesForApplication = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (
      user.role !== UserRole.APPLICANT &&
      user.role !== UserRole.PARENT &&
      !isStaff(user)
    ) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const classes = await AppDataSource.getRepository(Class).find({
      select: ['id', 'name'],
      order: { name: 'ASC' },
      take: 500,
    });
    res.json(classes);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Server error' });
  }
};

export const downloadDocument = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const docRepo = AppDataSource.getRepository(AdmissionDocument);
    const doc = await docRepo.findOne({
      where: { id: req.params.docId },
      relations: ['application'],
    });
    if (!doc?.application) return res.status(404).json({ message: 'Document not found' });
    if (!canAccessApplication(user, doc.application)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const rel = doc.storedPath.replace(/^\//, '');
    const fullPath = path.join(__dirname, '../../', rel);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ message: 'File not found on server' });

    res.download(fullPath, doc.originalFilename);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Server error' });
  }
};
