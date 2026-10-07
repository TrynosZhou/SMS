import { Repository } from 'typeorm';
import { Student } from '../entities/Student';

export const STUDENT_STATUS_NEW = 'New';
export const STUDENT_STATUS_EXISTING = 'Existing';

export function isNewStudentStatus(status: unknown): boolean {
  const s = String(status || '').trim().toLowerCase();
  if (!s) return false;
  if (s.includes('existing') || s === 'old' || s.includes('return')) return false;
  return s === 'new' || s.startsWith('new ');
}

/** True when the student has been allocated a class. */
export function studentHasClassAssignment(student: { classId?: string | null }): boolean {
  return !!String(student.classId || '').trim();
}

/**
 * New applies only at admission. Once a student is enrolled in a class they
 * become Existing and are billed like any other student (no admission desk/registration).
 * Returns true if the status was changed.
 */
export function applyExistingStatusIfEnrolled(student: {
  classId?: string | null;
  studentStatus?: string;
}): boolean {
  if (!studentHasClassAssignment(student)) return false;
  if (!isNewStudentStatus(student.studentStatus)) return false;
  student.studentStatus = STUDENT_STATUS_EXISTING;
  return true;
}

/** Flip every New student who already has a class to Existing. */
export async function markEnrolledStudentsExisting(
  studentRepository: Repository<Student>
): Promise<number> {
  const result = await studentRepository
    .createQueryBuilder()
    .update(Student)
    .set({ studentStatus: STUDENT_STATUS_EXISTING })
    .where('classId IS NOT NULL')
    .andWhere("LOWER(TRIM(COALESCE(studentStatus, ''))) IN (:...newStatuses)", {
      newStatuses: ['new', 'new student'],
    })
    .execute();
  return result.affected || 0;
}
