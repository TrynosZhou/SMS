import { UserRole } from '../entities/User';
import { canManageAllMessageBoxes } from '../constants/userRoles';

/** School leadership copied when a parent messages the administrator. */
export const PARENT_ADMIN_MESSAGE_CC = ['headmaster', 'deputy_headmaster'] as const;

export type ParentStaffInboxBox = 'admin' | 'accountant' | 'headmaster' | 'deputy_headmaster';

/** Persisted recipient list for a parent → staff message. */
export function buildParentMessageRecipients(primary: 'admin' | 'accountant'): string {
  if (primary === 'accountant') {
    return 'accountant';
  }
  return ['admin', ...PARENT_ADMIN_MESSAGE_CC].join(',');
}

/** Which inbox bucket the logged-in staff member should use for parent messages. */
export function resolveStaffParentInboxBox(role: UserRole | string | undefined | null): ParentStaffInboxBox {
  const r = String(role || '').toLowerCase();
  if (r === UserRole.ACCOUNTANT) return 'accountant';
  if (r === UserRole.HEADMASTER) return 'headmaster';
  if (r === UserRole.DEPUTY_HEADMASTER) return 'deputy_headmaster';
  return 'admin';
}

/** Resolve inbox from optional ?box= query (admin/accountant switcher on staff UI). */
export function resolveStaffParentInboxFromQuery(
  role: UserRole | string | undefined | null,
  requestedBox?: string | null
): ParentStaffInboxBox {
  const r = String(role || '').toLowerCase();
  const req = String(requestedBox || '').toLowerCase();
  if (req === 'admin' || req === 'accountant') {
    if (r === UserRole.ACCOUNTANT) {
      return 'accountant';
    }
    if (canManageAllMessageBoxes(r) || r === UserRole.ADMIN || r === UserRole.SUPERADMIN || r === UserRole.DIRECTOR) {
      return req as ParentStaffInboxBox;
    }
  }
  return resolveStaffParentInboxBox(r);
}

/** Whether a stored message belongs in the given staff inbox. */
export function staffInboxMatchesParentMessage(recipients: string, inboxBox: string): boolean {
  const parts = String(recipients || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const box = inboxBox.toLowerCase();
  if (parts.includes(box)) {
    return true;
  }
  // Leadership CC on administrator messages (legacy "admin" only or explicit CC list).
  if ((box === 'headmaster' || box === 'deputy_headmaster') && parts.includes('admin')) {
    return true;
  }
  if (box === 'admin' && parts.includes('admin')) {
    return true;
  }
  return false;
}
