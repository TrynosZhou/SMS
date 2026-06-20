export type StudentConfirmationAction = 'added' | 'updated' | 'deleted' | 'enrolled';

export interface StudentConfirmationLike {
  firstName?: string;
  lastName?: string;
  studentNumber?: string;
}

export interface StudentConfirmationParts {
  title: string;
  message: string;
}

export function studentDisplayLabel(student?: StudentConfirmationLike | null): string {
  const name = `${student?.firstName || ''} ${student?.lastName || ''}`.trim();
  const num = String(student?.studentNumber || '').trim();
  if (name && num) {
    return `${name} (${num})`;
  }
  return name || num || '';
}

export function studentDisplayLabelFromParams(name?: string | null, number?: string | null): string {
  const n = String(name || '').trim();
  const num = String(number || '').trim();
  if (n && num) {
    return `${n} (${num})`;
  }
  return n || num || '';
}

export function buildStudentConfirmation(
  action: StudentConfirmationAction,
  options?: { student?: StudentConfirmationLike | null; displayName?: string }
): StudentConfirmationParts {
  const label = options?.displayName || studentDisplayLabel(options?.student);
  switch (action) {
    case 'added':
      return {
        title: 'Student added',
        message: label
          ? `${label} has been registered successfully.`
          : 'The new student has been registered successfully.',
      };
    case 'updated':
      return {
        title: 'Student updated',
        message: label
          ? `${label}'s record has been updated successfully.`
          : 'The student record has been updated successfully.',
      };
    case 'deleted':
      return {
        title: 'Student deleted',
        message: label
          ? `${label} has been deleted successfully.`
          : 'The student record has been deleted successfully.',
      };
    case 'enrolled':
      return {
        title: 'Student enrolled',
        message: label
          ? `${label} has been enrolled in a class successfully.`
          : 'The student has been enrolled successfully.',
      };
    default:
      return { title: 'Success', message: 'Action completed successfully.' };
  }
}
