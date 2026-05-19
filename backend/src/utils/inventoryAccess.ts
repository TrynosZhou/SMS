import { AppDataSource } from '../config/database';
import { Settings } from '../entities/Settings';
import { User, UserRole } from '../entities/User';
import { InventoryAuditLog } from '../entities/InventoryAuditLog';

export interface InventoryConfigResolved {
  loanDaysDefault: number;
  overdueFinePerDay: number;
  lossGraceDaysAfterDue: number;
}

export async function resolveInventoryConfig(): Promise<InventoryConfigResolved> {
  const repo = AppDataSource.getRepository(Settings);
  const rows = await repo.find({ take: 1, order: { updatedAt: 'DESC' } });
  const inv = rows[0]?.inventorySettings || {};
  return {
    loanDaysDefault: Number(inv.loanDaysDefault) > 0 ? Number(inv.loanDaysDefault) : 14,
    overdueFinePerDay: Number(inv.overdueFinePerDay) >= 0 ? Number(inv.overdueFinePerDay) : 1,
    lossGraceDaysAfterDue: Number(inv.lossGraceDaysAfterDue) >= 0 ? Number(inv.lossGraceDaysAfterDue) : 30
  };
}

export function canUserManageInventory(user: User, settingsRow: Settings | null): boolean {
  if (user.role === UserRole.ADMIN || user.role === UserRole.SUPERADMIN) {
    return settingsRow?.moduleAccess?.admin?.inventory !== false;
  }
  if (user.role === UserRole.TEACHER && !(user as any).isUniversalTeacher) {
    return settingsRow?.moduleAccess?.teachers?.inventory === true;
  }
  if (user.role === UserRole.TEACHER && (user as any).isUniversalTeacher) {
    return settingsRow?.moduleAccess?.universalTeacher?.inventory === true;
  }
  return false;
}

export function canUserViewInventoryReports(user: User, settingsRow: Settings | null): boolean {
  if (user.role === UserRole.ADMIN || user.role === UserRole.SUPERADMIN) {
    return true;
  }
  if (user.role === UserRole.ACCOUNTANT) {
    return settingsRow?.moduleAccess?.accountant?.inventory !== false;
  }
  if (user.role === UserRole.TEACHER) {
    return canUserManageInventory(user, settingsRow);
  }
  return false;
}

export async function loadSettingsRow(): Promise<Settings | null> {
  const repo = AppDataSource.getRepository(Settings);
  const rows = await repo.find({ take: 1, order: { updatedAt: 'DESC' } });
  return rows[0] || null;
}

export async function writeInventoryAudit(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const log = AppDataSource.getRepository(InventoryAuditLog).create({
    userId,
    action,
    entityType,
    entityId,
    metadata: metadata || null
  });
  await AppDataSource.getRepository(InventoryAuditLog).save(log);
}
