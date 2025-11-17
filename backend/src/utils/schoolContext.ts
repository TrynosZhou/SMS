import { AuthRequest } from '../middleware/auth';

function resolveSchoolId(req: AuthRequest, errorCode: string): string {
  const schoolId = req.schoolId || req.user?.schoolId;
  if (!schoolId) {
    throw new Error(errorCode);
  }
  return schoolId;
}

export function getCurrentSchoolId(req: AuthRequest): string {
  return resolveSchoolId(req, 'SCHOOL_CONTEXT_MISSING');
}

export function getRequestSchoolId(req: AuthRequest): string {
  return resolveSchoolId(req, 'SCHOOL_ID_MISSING');
}

