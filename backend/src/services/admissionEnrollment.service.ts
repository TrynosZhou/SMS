import * as fs from 'fs';
import * as path from 'path';
import { AppDataSource } from '../config/database';
import {
  AdmissionApplication,
  AdmissionApplicationStatus,
  AdmissionApplicationType,
} from '../entities/AdmissionApplication';
import { AdmissionDocument, AdmissionDocumentType } from '../entities/AdmissionDocument';
import { Student } from '../entities/Student';
import { Parent } from '../entities/Parent';
import { ParentStudent } from '../entities/ParentStudent';
import { Class } from '../entities/Class';
import { generateStudentId } from '../utils/studentIdGenerator';
import { notifyApplicantEnrolled } from '../utils/admissionNotifications';

function copyAdmissionPhotoToStudent(app: AdmissionApplication): string | null {
  const doc = app.documents?.find((d) => d.documentType === AdmissionDocumentType.ID_PHOTO);
  if (!doc?.storedPath) return null;
  const rel = doc.storedPath.replace(/^\//, '');
  const src = path.join(__dirname, '../../', rel);
  if (!fs.existsSync(src)) return null;
  const destDir = path.join(__dirname, '../../uploads/students');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const ext = path.extname(src) || '.jpg';
  const destName = `student-adm-${Date.now()}${ext}`;
  const dest = path.join(destDir, destName);
  fs.copyFileSync(src, dest);
  return `/uploads/students/${destName}`;
}

export async function enrollApplicationAsStudent(
  applicationId: string
): Promise<{ student: Student; application: AdmissionApplication }> {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();

  const appRepo = AppDataSource.getRepository(AdmissionApplication);
  const app = await appRepo.findOne({
    where: { id: applicationId },
    relations: ['documents', 'classApplyingFor'],
  });
  if (!app) {
    throw new Error('Application not found');
  }
  if (app.status !== AdmissionApplicationStatus.ACCEPTED) {
    throw new Error('Only accepted applications can be enrolled as students');
  }
  if (app.enrolledStudentId) {
    const existing = await AppDataSource.getRepository(Student).findOne({
      where: { id: app.enrolledStudentId },
    });
    if (existing) {
      return { student: existing, application: app };
    }
  }

  const studentRepo = AppDataSource.getRepository(Student);
  const duplicate = await studentRepo
    .createQueryBuilder('s')
    .where('LOWER(s.firstName) = LOWER(:f)', { f: app.firstName.trim() })
    .andWhere('LOWER(s.lastName) = LOWER(:l)', { l: app.lastName.trim() })
    .andWhere('s.gender = :g', { g: app.gender || 'Male' })
    .getOne();
  if (duplicate) {
    app.enrolledStudentId = duplicate.id;
    app.enrolledAt = new Date();
    await appRepo.save(app);
    return { student: duplicate, application: app };
  }

  let classId: string | null = app.classApplyingForId;
  if (classId) {
    const cls = await AppDataSource.getRepository(Class).findOne({ where: { id: classId } });
    if (!cls) classId = null;
  }

  const studentNumber = await generateStudentId();
  const photo = copyAdmissionPhotoToStudent(app);
  const studentStatus =
    app.applicationType === AdmissionApplicationType.TRANSFER ? 'Existing' : 'New';
  const grade = app.gradeApplyingFor?.trim() || null;

  let parsedDob: Date | null = null;
  if (app.dateOfBirth) {
    const d = new Date(app.dateOfBirth);
    if (!isNaN(d.getTime())) parsedDob = d;
  }

  const student = studentRepo.create({
    firstName: app.firstName.trim(),
    lastName: app.lastName.trim(),
    studentNumber,
    dateOfBirth: parsedDob,
    gender: app.gender || 'Male',
    studentStatus,
    address: app.address?.trim() || null,
    phoneNumber: app.phone?.trim() || null,
    contactNumber: app.phone?.trim() || null,
    studentType: 'Day Scholar',
    usesTransport: false,
    usesDiningHall: false,
    isStaffChild: false,
    isExempted: false,
    photo,
    classId,
    classLevel: grade,
    grade,
    enrollmentDate: new Date(),
    isActive: true,
  });

  await studentRepo.save(student);

  if (app.parentUserId) {
    const parent = await AppDataSource.getRepository(Parent).findOne({
      where: { userId: app.parentUserId },
    });
    if (parent) {
      student.parentId = parent.id;
      await studentRepo.save(student);
      const linkRepo = AppDataSource.getRepository(ParentStudent);
      const existingLink = await linkRepo.findOne({
        where: { parentId: parent.id, studentId: student.id },
      });
      if (!existingLink) {
        await linkRepo.save(
          linkRepo.create({
            parentId: parent.id,
            studentId: student.id,
            relationshipType: app.guardianRelationship?.trim() || 'guardian',
          })
        );
      }
    }
  }

  app.enrolledStudentId = student.id;
  app.enrolledAt = new Date();
  await appRepo.save(app);

  try {
    await notifyApplicantEnrolled(app, student.studentNumber);
  } catch (e) {
    console.warn('[Admissions] Enrolled notification failed:', e);
  }

  const full = await appRepo.findOne({
    where: { id: app.id },
    relations: ['documents', 'classApplyingFor', 'enrolledStudent'],
  });

  return { student, application: full || app };
}
