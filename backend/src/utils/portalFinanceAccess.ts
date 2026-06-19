import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { Student } from '../entities/Student';
import { Parent } from '../entities/Parent';
import { ParentStudent } from '../entities/ParentStudent';
import { userHasPermission } from '../services/rbac.service';
import { isFullAccessRole } from '../constants/userRoles';

export type PortalFinanceScope =
  | { kind: 'staff' }
  | { kind: 'scoped'; studentId: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function userHasFinanceView(user: NonNullable<AuthRequest['user']>): Promise<boolean> {
  if (
    isFullAccessRole(user.role) ||
    user.role === UserRole.ADMIN ||
    user.role === UserRole.DIRECTOR
  ) {
    return true;
  }
  return userHasPermission(user, 'finance', 'view');
}

export async function resolveStudentForUser(user: NonNullable<AuthRequest['user']>): Promise<Student | null> {
  let student = user.student as Student | undefined;
  if (student?.id) return student;

  const studentRepo = AppDataSource.getRepository(Student);
  student =
    (await studentRepo.findOne({
      where: { userId: user.id },
    })) ||
    (await studentRepo.findOne({
      where: { studentNumber: user.username },
    })) ||
    undefined;

  return student || null;
}

async function resolveParentForRequest(req: AuthRequest): Promise<Parent | null> {
  const user = req.user;
  if (!user) return null;

  const parentRepository = AppDataSource.getRepository(Parent);
  let parent = user.parent || null;
  if (!parent) {
    parent = await parentRepository.findOne({ where: { userId: user.id } });
  }
  if (!parent && user.email) {
    parent = await parentRepository.findOne({
      where: { email: String(user.email).trim().toLowerCase() },
    });
  }
  return parent;
}

async function findStudentByIdOrNumber(idOrNumber: string): Promise<Student | null> {
  const trimmed = String(idOrNumber || '').trim();
  if (!trimmed) return null;

  const studentRepo = AppDataSource.getRepository(Student);
  if (UUID_RE.test(trimmed)) {
    return studentRepo.findOne({ where: { id: trimmed } });
  }
  return studentRepo
    .createQueryBuilder('student')
    .where('LOWER(student.studentNumber) = LOWER(:studentNumber)', { studentNumber: trimmed })
    .getOne();
}

async function parentCanAccessStudent(req: AuthRequest, studentId: string): Promise<boolean> {
  const parent = await resolveParentForRequest(req);
  if (!parent?.id) return false;

  const link = await AppDataSource.getRepository(ParentStudent).findOne({
    where: { parentId: parent.id, studentId },
  });
  return !!link;
}

/** Staff see all (subject to query); students/parents are scoped to linked student records. */
export async function resolvePortalFinanceStudentScope(
  req: AuthRequest,
  res: Response,
  requestedStudentId?: string
): Promise<PortalFinanceScope | null> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: 'Authentication required' });
    return null;
  }

  if (await userHasFinanceView(user)) {
    return { kind: 'staff' };
  }

  if (user.role === UserRole.STUDENT) {
    const student = await resolveStudentForUser(user);
    if (!student?.id) {
      res.status(403).json({ message: 'Student information not found. Please log in again.' });
      return null;
    }

    const reqId = String(requestedStudentId || '').trim();
    if (
      reqId &&
      reqId !== student.id &&
      reqId.toLowerCase() !== String(student.studentNumber || '').toLowerCase()
    ) {
      res.status(403).json({ message: 'You can only access your own invoices.' });
      return null;
    }

    return { kind: 'scoped', studentId: student.id };
  }

  if (user.role === UserRole.PARENT) {
    const target = String(requestedStudentId || '').trim();
    if (!target) {
      res.status(400).json({ message: 'Student ID is required.' });
      return null;
    }

    const student = await findStudentByIdOrNumber(target);
    if (!student?.id) {
      res.status(404).json({ message: 'Student not found.' });
      return null;
    }

    const allowed = await parentCanAccessStudent(req, student.id);
    if (!allowed) {
      res.status(403).json({ message: 'You can only access invoices for your linked students.' });
      return null;
    }

    return { kind: 'scoped', studentId: student.id };
  }

  res.status(403).json({
    message: 'Access denied. You do not have permission to perform this action.',
    code: 'RBAC_FORBIDDEN',
    module: 'finance',
    action: 'view',
  });
  return null;
}

export async function assertUserCanAccessStudentFinance(
  req: AuthRequest,
  res: Response,
  studentId: string
): Promise<boolean> {
  const scope = await resolvePortalFinanceStudentScope(req, res, studentId);
  if (!scope) return false;
  if (scope.kind === 'staff') return true;
  if (scope.studentId !== studentId) {
    res.status(403).json({ message: 'Access denied.' });
    return false;
  }
  return true;
}
