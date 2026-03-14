import { AppDataSource } from '../config/database';
import { AncillaryStaff } from '../entities/AncillaryStaff';

/**
 * Generates a unique EmployeeID for ancillary staff.
 * Format: JPSA + 3 random digits + 4-digit year (e.g. JPSA7422025)
 */
export async function generateAncillaryStaffEmployeeId(): Promise<string> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const repo = AppDataSource.getRepository(AncillaryStaff);
  const year = new Date().getFullYear();
  const yearStr = year.toString();

  let attempts = 0;
  let employeeId: string;
  let existing: AncillaryStaff | null;

  do {
    // 3 random digits (100 to 999)
    const randomPart = Math.floor(Math.random() * 900) + 100;
    employeeId = `JPSA${randomPart}${yearStr}`;

    existing = await repo.findOne({ where: { employeeId } });
    attempts++;

    if (attempts > 100) {
      throw new Error('Unable to generate unique ancillary staff EmployeeID after multiple attempts');
    }
  } while (existing);

  return employeeId;
}
