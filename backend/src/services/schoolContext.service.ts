import { AppDataSource } from '../config/database';
import { School } from '../entities/School';
import { AuthRequest } from '../middleware/auth';

let cachedDefaultSchoolId: string | null = null;

/**
 * Resolves the school context for license checks.
 * Priority: x-school-id header → DEFAULT_SCHOOL_ID env → first active school in DB.
 */
export async function resolveSchoolId(req?: AuthRequest): Promise<string | null> {
  const headerId = String(req?.headers['x-school-id'] || '').trim();
  if (headerId) {
    return headerId;
  }

  const envId = String(process.env.DEFAULT_SCHOOL_ID || '').trim();
  if (envId) {
    return envId;
  }

  if (cachedDefaultSchoolId) {
    return cachedDefaultSchoolId;
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const schoolRepo = AppDataSource.getRepository(School);
  const school = await schoolRepo.findOne({
    where: { isActive: true },
    order: { createdAt: 'ASC' }
  });

  if (school?.id) {
    cachedDefaultSchoolId = school.id;
    return school.id;
  }

  return null;
}

export function clearDefaultSchoolCache(): void {
  cachedDefaultSchoolId = null;
}
