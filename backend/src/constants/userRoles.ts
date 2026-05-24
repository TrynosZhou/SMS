import { UserRole } from '../entities/User';

/** Director and Super Administrator — full system access */
export const FULL_ACCESS_ROLES = new Set<UserRole>([UserRole.SUPERADMIN, UserRole.DIRECTOR]);

/** Can open Permissions & Roles and manage RBAC */
export const RBAC_MANAGER_ROLES = new Set<UserRole>([
  UserRole.SUPERADMIN,
  UserRole.DIRECTOR,
  UserRole.ADMIN,
]);

/** Login roles grouped as School Admin (configurable via RBAC) */
export const SCHOOL_ADMIN_LOGIN_ROLES = new Set<UserRole>([
  UserRole.HEADMASTER,
  UserRole.DEPUTY_HEADMASTER,
]);

/** Staff who use the main dashboard (not teacher/parent/student portals) */
export const MAIN_DASHBOARD_ROLES = new Set<UserRole>([
  UserRole.SUPERADMIN,
  UserRole.DIRECTOR,
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.HEADMASTER,
  UserRole.DEPUTY_HEADMASTER,
  UserRole.DEMO_USER,
]);

export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  [UserRole.SUPERADMIN]: 'Super Administrator',
  [UserRole.DIRECTOR]: 'Director',
  [UserRole.ADMIN]: 'Administrator',
  [UserRole.HEADMASTER]: 'Headmaster',
  [UserRole.DEPUTY_HEADMASTER]: 'Deputy Headmaster',
  [UserRole.ACCOUNTANT]: 'Accountant',
  [UserRole.TEACHER]: 'Teacher',
  [UserRole.PARENT]: 'Parent',
  [UserRole.STUDENT]: 'Student',
  [UserRole.DEMO_USER]: 'Demo User',
};

/** RBAC matrix role picker groups */
export const RBAC_ROLE_GROUPS: Array<{ key: string; label: string; slugs: string[] }> = [
  {
    key: 'executive',
    label: 'Executive leadership',
    slugs: ['superadmin', 'director'],
  },
  {
    key: 'schoolAdmin',
    label: 'School Admin',
    slugs: ['headmaster', 'deputy-headmaster'],
  },
  {
    key: 'operations',
    label: 'School operations',
    slugs: ['admin', 'accountant'],
  },
  {
    key: 'teaching',
    label: 'Teaching',
    slugs: ['teacher', 'class-teacher'],
  },
  {
    key: 'portal',
    label: 'Portal users',
    slugs: ['parent', 'student', 'demo-user'],
  },
];

export function isFullAccessRole(role: UserRole | string | undefined | null): boolean {
  if (!role) return false;
  return FULL_ACCESS_ROLES.has(String(role).toLowerCase() as UserRole);
}

export function canManageRbac(role: UserRole | string | undefined | null): boolean {
  if (!role) return false;
  return RBAC_MANAGER_ROLES.has(String(role).toLowerCase() as UserRole);
}

export function isSchoolAdminLoginRole(role: UserRole | string | undefined | null): boolean {
  if (!role) return false;
  return SCHOOL_ADMIN_LOGIN_ROLES.has(String(role).toLowerCase() as UserRole);
}

/** Inbox, outbox, parent messages, drafts — school staff (not teachers/parents/students) */
export const STAFF_MESSAGE_ROLES = new Set<UserRole>([
  UserRole.SUPERADMIN,
  UserRole.DIRECTOR,
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.HEADMASTER,
  UserRole.DEPUTY_HEADMASTER,
]);

export function canAccessStaffMessages(role: UserRole | string | undefined | null): boolean {
  if (!role) return false;
  return STAFF_MESSAGE_ROLES.has(String(role).toLowerCase() as UserRole);
}

/** View accountant / admin / teacher outboxes (leadership & administrators) */
export function canManageAllMessageBoxes(role: UserRole | string | undefined | null): boolean {
  if (!role) return false;
  const r = String(role).toLowerCase();
  return (
    isFullAccessRole(r) ||
    r === UserRole.ADMIN ||
    r === UserRole.HEADMASTER ||
    r === UserRole.DEPUTY_HEADMASTER
  );
}

/** Expand route guards: Director with Super Admin; School Admin with Administrator */
export function expandAuthorizeRoles(roles: UserRole[]): UserRole[] {
  const set = new Set(roles);
  if (set.has(UserRole.SUPERADMIN)) {
    set.add(UserRole.DIRECTOR);
  }
  if (set.has(UserRole.ADMIN)) {
    set.add(UserRole.DIRECTOR);
    set.add(UserRole.HEADMASTER);
    set.add(UserRole.DEPUTY_HEADMASTER);
  }
  return Array.from(set);
}
