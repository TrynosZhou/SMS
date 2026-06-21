import { AppDataSource } from '../config/database';
import { Student } from '../entities/Student';

export interface StudentLookupRecord {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  studentType: string | null;
  class: { id: string; name: string } | null;
}

export type StudentLookupResult =
  | { kind: 'single'; student: StudentLookupRecord }
  | { kind: 'multiple'; matches: StudentLookupRecord[] }
  | { kind: 'none' };

function mapStudent(student: Student): StudentLookupRecord {
  return {
    id: student.id,
    studentNumber: student.studentNumber,
    firstName: student.firstName,
    lastName: student.lastName,
    studentType: (student as any).studentType ?? null,
    class: student.classEntity
      ? { id: student.classEntity.id, name: student.classEntity.name }
      : null,
  };
}

function activeStudentClause(alias = 'student'): string {
  return `(${alias}.isActive IS NULL OR ${alias}.isActive = :active)`;
}

/** Fast student lookup for finance forms — exact match first, no invoice/balance loading. */
export async function lookupStudentByQuery(rawQuery: string): Promise<StudentLookupResult> {
  const trimmed = String(rawQuery || '').trim();
  if (!trimmed) {
    return { kind: 'none' };
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const studentRepository = AppDataSource.getRepository(Student);
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (uuidRegex.test(trimmed)) {
    const byId = await studentRepository.findOne({
      where: { id: trimmed },
      relations: ['classEntity'],
    });
    if (byId && (byId.isActive === null || byId.isActive === true)) {
      return { kind: 'single', student: mapStudent(byId) };
    }
  }

  const byNumber = await studentRepository
    .createQueryBuilder('student')
    .leftJoinAndSelect('student.classEntity', 'classEntity')
    .where(activeStudentClause('student'), { active: true })
    .andWhere('LOWER(student.studentNumber) = LOWER(:studentNumber)', { studentNumber: trimmed })
    .getOne();
  if (byNumber) {
    return { kind: 'single', student: mapStudent(byNumber) };
  }

  const byLastName = await studentRepository
    .createQueryBuilder('student')
    .leftJoinAndSelect('student.classEntity', 'classEntity')
    .where(activeStudentClause('student'), { active: true })
    .andWhere('LOWER(student.lastName) = LOWER(:lastName)', { lastName: trimmed })
    .orderBy('student.firstName', 'ASC')
    .take(20)
    .getMany();

  if (byLastName.length === 1) {
    return { kind: 'single', student: mapStudent(byLastName[0]) };
  }
  if (byLastName.length > 1) {
    return { kind: 'multiple', matches: byLastName.map(mapStudent) };
  }

  const byFirstName = await studentRepository
    .createQueryBuilder('student')
    .leftJoinAndSelect('student.classEntity', 'classEntity')
    .where(activeStudentClause('student'), { active: true })
    .andWhere('LOWER(student.firstName) = LOWER(:firstName)', { firstName: trimmed })
    .orderBy('student.lastName', 'ASC')
    .take(20)
    .getMany();

  if (byFirstName.length === 1) {
    return { kind: 'single', student: mapStudent(byFirstName[0]) };
  }
  if (byFirstName.length > 1) {
    return { kind: 'multiple', matches: byFirstName.map(mapStudent) };
  }

  const likeTerm = `%${trimmed}%`;
  const partialMatches = await studentRepository
    .createQueryBuilder('student')
    .leftJoinAndSelect('student.classEntity', 'classEntity')
    .where(activeStudentClause('student'), { active: true })
    .andWhere(
      `(LOWER(student.studentNumber) LIKE LOWER(:term)
        OR LOWER(student.lastName) LIKE LOWER(:term)
        OR LOWER(student.firstName) LIKE LOWER(:term)
        OR LOWER(CONCAT(COALESCE(student.firstName, ''), ' ', COALESCE(student.lastName, ''))) LIKE LOWER(:term)
        OR LOWER(CONCAT(COALESCE(student.lastName, ''), ' ', COALESCE(student.firstName, ''))) LIKE LOWER(:term))`,
      { term: likeTerm }
    )
    .orderBy('student.lastName', 'ASC')
    .addOrderBy('student.firstName', 'ASC')
    .take(15)
    .getMany();

  if (partialMatches.length === 1) {
    return { kind: 'single', student: mapStudent(partialMatches[0]) };
  }
  if (partialMatches.length > 1) {
    return { kind: 'multiple', matches: partialMatches.map(mapStudent) };
  }

  return { kind: 'none' };
}
