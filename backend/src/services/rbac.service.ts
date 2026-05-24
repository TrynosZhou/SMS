import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { RbacRole } from '../entities/RbacRole';
import { UserRbacRole } from '../entities/UserRbacRole';
import { User, UserRole } from '../entities/User';
import {
  RBAC_ACTIONS,
  RBAC_MODULES,
  permissionKey,
  RbacAction,
} from '../constants/rbac';
import {
  buildFinancePagePermissions,
  mergeMissingFinancePagePermissions,
} from '../constants/financeRbac';
import { FULL_ACCESS_ROLES } from '../constants/userRoles';
import { ensureUserRoleEnumValues } from '../utils/ensureUserRoleEnum';

/** Stable compare for permission maps (jsonb key order varies in PostgreSQL). */
function permissionsMapsEqual(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  const keysA = Object.keys(a || {}).sort();
  const keysB = Object.keys(b || {}).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return false;
    if (a[keysA[i]] !== b[keysB[i]]) return false;
  }
  return true;
}

/** Default module-level view map per legacy role (used when seeding system roles) */
const LEGACY_VIEW_DEFAULTS: Record<string, Record<string, boolean>> = {
  superadmin: Object.fromEntries(RBAC_MODULES.map((m) => [m.key, true])),
  admin: {
    dashboard: true,
    students: true,
    attendance: true,
    timetable: true,
    exams: true,
    reportCards: true,
    rankings: true,
    finance: true,
    payroll: true,
    reports: true,
    library: true,
    staff: true,
    classes: true,
    subjects: true,
    notices: true,
    messages: true,
    parents: true,
    settings: true,
    accounts: true,
    audit: true,
    logistics: true,
    elearning: true,
    recordBook: true,
  },
  accountant: {
    dashboard: true,
    students: true,
    finance: true,
    reports: true,
    library: true,
    logistics: true,
    parents: false,
    settings: false,
    exams: false,
    reportCards: false,
    attendance: false,
  },
  teacher: {
    dashboard: true,
    students: true,
    classes: true,
    subjects: true,
    exams: true,
    reportCards: true,
    rankings: true,
    attendance: true,
    recordBook: true,
    elearning: true,
    timetable: true,
    finance: false,
    settings: false,
    staff: false,
    parents: false,
  },
  parent: {
    dashboard: true,
    reportCards: true,
    finance: true,
    messages: true,
    notices: true,
  },
  student: {
    dashboard: true,
    subjects: true,
    reportCards: true,
    finance: false,
    elearning: true,
    notices: true,
  },
  demo_user: {
    dashboard: true,
    students: true,
    staff: true,
    classes: true,
    subjects: true,
    exams: true,
    reportCards: true,
    rankings: true,
    finance: true,
    attendance: true,
    messages: true,
    accounts: true,
    library: true,
    logistics: true,
  },
  director: Object.fromEntries(RBAC_MODULES.map((m) => [m.key, true])),
  headmaster: {
    dashboard: true,
    students: true,
    attendance: true,
    timetable: true,
    exams: true,
    reportCards: true,
    rankings: true,
    finance: false,
    reports: true,
    library: true,
    staff: true,
    classes: true,
    subjects: true,
    notices: true,
    messages: true,
    parents: true,
    logistics: true,
    elearning: true,
    recordBook: true,
    settings: false,
    accounts: false,
    audit: true,
    payroll: false,
  },
  deputy_headmaster: {
    dashboard: true,
    students: true,
    attendance: true,
    timetable: true,
    exams: true,
    reportCards: true,
    rankings: true,
    finance: false,
    reports: true,
    library: true,
    staff: true,
    classes: true,
    subjects: true,
    notices: true,
    messages: true,
    parents: true,
    logistics: false,
    elearning: true,
    recordBook: true,
    settings: false,
    accounts: false,
    audit: false,
    payroll: false,
  },
};

export function buildFullPermissions(
  moduleFlags: Record<string, boolean>,
  actions: readonly string[] = RBAC_ACTIONS
): Record<string, boolean> {
  const perms: Record<string, boolean> = {};
  for (const mod of RBAC_MODULES) {
    const enabled = moduleFlags[mod.key] === true;
    for (const action of actions) {
      perms[permissionKey(mod.key, action)] = enabled;
      if (enabled && action === 'view') {
        perms[permissionKey(mod.key, action)] = true;
      }
      if (!enabled) {
        perms[permissionKey(mod.key, action)] = false;
      } else {
        // Grant view always when module enabled; other actions based on role defaults
        if (action === 'view') {
          perms[permissionKey(mod.key, action)] = true;
        } else if (action === 'create' || action === 'edit') {
          perms[permissionKey(mod.key, action)] = ['admin', 'superadmin', 'teacher', 'accountant', 'demo_user'].some(
            () => true
          );
          perms[permissionKey(mod.key, action)] = true;
        } else if (action === 'delete' || action === 'approve') {
          perms[permissionKey(mod.key, action)] = false;
        } else if (action === 'export') {
          perms[permissionKey(mod.key, action)] = ['reports', 'finance', 'students', 'attendance', 'exams'].includes(
            mod.key
          );
        }
      }
    }
  }
  return perms;
}

/** Add module permissions from LEGACY_VIEW_DEFAULTS when missing or when defaults were strengthened */
/** Enforce finance/payroll policy for School Admin roles (Headmaster, Deputy) on each seed */
/** Teacher / class-teacher roles must never access Teacher or Parent registration records */
export const TEACHER_PEOPLE_RECORDS_SLUGS = new Set(['teacher', 'class-teacher']);
const TEACHER_LOCKED_PEOPLE_MODULES = ['staff', 'parents'] as const;

export function isTeacherPeopleRecordsRole(context: {
  slug?: string;
  legacyRoleKey?: string | null;
}): boolean {
  const slug = context.slug || '';
  const legacy = context.legacyRoleKey || '';
  return TEACHER_PEOPLE_RECORDS_SLUGS.has(slug) || legacy === 'teacher';
}

export function reconcileTeacherPeopleRecordsPermissions(
  existing: Record<string, boolean>,
  context: { slug?: string; legacyRoleKey?: string | null }
): Record<string, boolean> {
  if (!isTeacherPeopleRecordsRole(context)) {
    return existing;
  }
  const merged = { ...existing };
  for (const mod of TEACHER_LOCKED_PEOPLE_MODULES) {
    for (const action of RBAC_ACTIONS) {
      merged[permissionKey(mod, action)] = false;
    }
  }
  return merged;
}

export function reconcileSchoolAdminFinancePayrollPermissions(
  existing: Record<string, boolean>,
  legacyKey: string
): Record<string, boolean> {
  if (!['headmaster', 'deputy_headmaster'].includes(legacyKey)) {
    return existing;
  }
  const flags = LEGACY_VIEW_DEFAULTS[legacyKey];
  if (!flags) return existing;

  const merged = { ...existing };
  const financeOn = flags.finance === true;
  const payrollOn = flags.payroll === true;

  for (const action of RBAC_ACTIONS) {
    merged[permissionKey('finance', action)] = financeOn;
    merged[permissionKey('payroll', action)] = payrollOn;
  }

  const financePerms = buildFinancePagePermissions({ legacyRoleKey: legacyKey });
  for (const [key, val] of Object.entries(financePerms)) {
    if (key.startsWith('financePage.')) {
      merged[key] = val;
    }
  }

  return merged;
}

export function mergeMissingModulePermissions(
  existing: Record<string, boolean>,
  legacyKey: string,
  adminLevel?: boolean
): Record<string, boolean> {
  const flags = LEGACY_VIEW_DEFAULTS[legacyKey];
  if (!flags) return existing;
  const expected = buildPermissionsFromModuleFlags(flags, { adminLevel });
  const merged = { ...existing };
  for (const [key, val] of Object.entries(expected)) {
    if (val === true && merged[key] !== true) {
      merged[key] = true;
    }
  }
  return merged;
}

export function buildPermissionsFromModuleFlags(
  moduleFlags: Record<string, boolean>,
  options?: { adminLevel?: boolean }
): Record<string, boolean> {
  const perms: Record<string, boolean> = {};
  const adminLevel = options?.adminLevel === true;

  for (const mod of RBAC_MODULES) {
    const enabled = moduleFlags[mod.key] === true;
    for (const action of RBAC_ACTIONS) {
      if (!enabled) {
        perms[permissionKey(mod.key, action)] = false;
        continue;
      }
      if (action === 'view') {
        perms[permissionKey(mod.key, action)] = true;
      } else if (adminLevel) {
        perms[permissionKey(mod.key, action)] = true;
      } else if (action === 'create' || action === 'edit') {
        perms[permissionKey(mod.key, action)] = !['settings', 'accounts', 'audit', 'payroll'].includes(mod.key);
      } else if (action === 'export') {
        perms[permissionKey(mod.key, action)] = [
          'students',
          'attendance',
          'exams',
          'reportCards',
          'finance',
          'reports',
        ].includes(mod.key);
      } else {
        perms[permissionKey(mod.key, action)] = false;
      }
    }
  }
  return perms;
}

const SYSTEM_ROLE_DEFS: Array<{
  name: string;
  slug: string;
  legacyRoleKey: string;
  description: string;
  adminLevel?: boolean;
}> = [
  { name: 'Super Administrator', slug: 'superadmin', legacyRoleKey: 'superadmin', description: 'Full system access', adminLevel: true },
  {
    name: 'Director',
    slug: 'director',
    legacyRoleKey: 'director',
    description: 'Executive director with full system oversight (same access as Super Administrator)',
    adminLevel: true,
  },
  { name: 'Administrator', slug: 'admin', legacyRoleKey: 'admin', description: 'School administrator', adminLevel: true },
  {
    name: 'Headmaster',
    slug: 'headmaster',
    legacyRoleKey: 'headmaster',
    description: 'School Admin — headmaster; module access configured by Director or Super Administrator',
  },
  {
    name: 'Deputy Headmaster',
    slug: 'deputy-headmaster',
    legacyRoleKey: 'deputy_headmaster',
    description: 'School Admin — deputy headmaster; module access configured by Director or Super Administrator',
  },
  { name: 'Accountant', slug: 'accountant', legacyRoleKey: 'accountant', description: 'Finance and fees' },
  { name: 'Teacher', slug: 'teacher', legacyRoleKey: 'teacher', description: 'Teaching staff' },
  { name: 'Class Teacher', slug: 'class-teacher', legacyRoleKey: 'teacher', description: 'Class teacher with extended student access' },
  { name: 'Parent', slug: 'parent', legacyRoleKey: 'parent', description: 'Parent portal user' },
  { name: 'Student', slug: 'student', legacyRoleKey: 'student', description: 'Student portal user' },
  { name: 'Demo User', slug: 'demo-user', legacyRoleKey: 'demo_user', description: 'Demonstration account' },
];

/** Create RBAC tables when migrations did not run (e.g. DB_SYNC=false and older migration failures). */
export async function ensureRbacSchema(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const existing = await AppDataSource.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rbac_roles' LIMIT 1`
  );
  if (Array.isArray(existing) && existing.length > 0) {
    return;
  }

  console.log('[RBAC] Creating rbac_roles and user_rbac_roles tables…');

  await AppDataSource.query(`
    CREATE TABLE IF NOT EXISTS "rbac_roles" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "name" character varying NOT NULL,
      "slug" character varying NOT NULL,
      "description" text,
      "isSystem" boolean NOT NULL DEFAULT false,
      "legacyRoleKey" character varying(64),
      "permissions" jsonb NOT NULL DEFAULT '{}',
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_rbac_roles_name" UNIQUE ("name"),
      CONSTRAINT "UQ_rbac_roles_slug" UNIQUE ("slug"),
      CONSTRAINT "PK_rbac_roles" PRIMARY KEY ("id")
    )
  `);

  await AppDataSource.query(`
    CREATE TABLE IF NOT EXISTS "user_rbac_roles" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "userId" uuid NOT NULL,
      "roleId" uuid NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_user_rbac_roles_user_role" UNIQUE ("userId", "roleId"),
      CONSTRAINT "PK_user_rbac_roles" PRIMARY KEY ("id"),
      CONSTRAINT "FK_user_rbac_roles_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_user_rbac_roles_role" FOREIGN KEY ("roleId") REFERENCES "rbac_roles"("id") ON DELETE CASCADE
    )
  `);

  await AppDataSource.query(
    `CREATE INDEX IF NOT EXISTS "IDX_user_rbac_roles_userId" ON "user_rbac_roles" ("userId")`
  );
  await AppDataSource.query(
    `CREATE INDEX IF NOT EXISTS "IDX_user_rbac_roles_roleId" ON "user_rbac_roles" ("roleId")`
  );
}

export async function ensureRbacSeeded(): Promise<void> {
  await ensureRbacSchema();
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  await ensureUserRoleEnumValues();
  const roleRepo = AppDataSource.getRepository(RbacRole);

  for (const def of SYSTEM_ROLE_DEFS) {
    let role = await roleRepo.findOne({ where: { slug: def.slug } });
    const legacyKey = def.legacyRoleKey;
    const flags = LEGACY_VIEW_DEFAULTS[legacyKey] || LEGACY_VIEW_DEFAULTS['teacher'];
    const modulePerms = buildPermissionsFromModuleFlags(flags, { adminLevel: def.adminLevel });
    const financePerms = buildFinancePagePermissions({
      legacyRoleKey: legacyKey,
      adminLevel: def.adminLevel,
    });
    const permissions = { ...modulePerms, ...financePerms };

    if (!role) {
      role = roleRepo.create({
        name: def.name,
        slug: def.slug,
        description: def.description,
        isSystem: def.slug !== 'class-teacher',
        legacyRoleKey: def.slug === 'class-teacher' ? null : legacyKey,
        permissions,
      });
      await roleRepo.save(role);
    } else if (!role.permissions || Object.keys(role.permissions).length === 0) {
      role.permissions = permissions;
      await roleRepo.save(role);
    } else {
      let       merged = mergeMissingFinancePagePermissions(
        role.permissions,
        legacyKey,
        def.adminLevel
      );
      if (def.adminLevel) {
        const fullFinance = buildFinancePagePermissions({ adminLevel: true });
        merged = { ...merged, ...fullFinance };
      }
      merged = mergeMissingModulePermissions(merged, legacyKey, def.adminLevel);
      if (def.slug === 'headmaster' || def.slug === 'deputy-headmaster') {
        merged = reconcileSchoolAdminFinancePayrollPermissions(merged, legacyKey);
      }
      merged = reconcileTeacherPeopleRecordsPermissions(merged, {
        slug: def.slug,
        legacyRoleKey: role.legacyRoleKey ?? def.legacyRoleKey,
      });
      if (!permissionsMapsEqual(merged, role.permissions)) {
        role.permissions = merged;
        await roleRepo.save(role);
      }
    }
  }
}

export async function syncUserRoleAssignment(user: User): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  await ensureRbacSeeded();
  const urRepo = AppDataSource.getRepository(UserRbacRole);
  const roleRepo = AppDataSource.getRepository(RbacRole);

  const existing = await urRepo.count({ where: { userId: user.id } });
  if (existing > 0) return;

  const slugMap: Record<string, string> = {
    [UserRole.SUPERADMIN]: 'superadmin',
    [UserRole.DIRECTOR]: 'director',
    [UserRole.ADMIN]: 'admin',
    [UserRole.HEADMASTER]: 'headmaster',
    [UserRole.DEPUTY_HEADMASTER]: 'deputy-headmaster',
    [UserRole.ACCOUNTANT]: 'accountant',
    [UserRole.TEACHER]: 'teacher',
    [UserRole.PARENT]: 'parent',
    [UserRole.STUDENT]: 'student',
    [UserRole.DEMO_USER]: 'demo-user',
  };

  const slug = slugMap[user.role];
  if (!slug) return;

  const role = await roleRepo.findOne({ where: { slug } });
  if (!role) return;

  await urRepo.save(urRepo.create({ userId: user.id, roleId: role.id }));
}

export async function resolveUserPermissions(user: User): Promise<Record<string, boolean>> {
  if (FULL_ACCESS_ROLES.has(user.role)) {
    const modulePerms = buildPermissionsFromModuleFlags(
      Object.fromEntries(RBAC_MODULES.map((m) => [m.key, true])),
      { adminLevel: true }
    );
    const financePerms = buildFinancePagePermissions({ adminLevel: true });
    return { ...modulePerms, ...financePerms };
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  await ensureRbacSeeded();
  await syncUserRoleAssignment(user);

  const urRepo = AppDataSource.getRepository(UserRbacRole);
  const assignments = await urRepo.find({
    where: { userId: user.id },
    relations: ['role'],
  });

  const merged: Record<string, boolean> = {};
  for (const a of assignments) {
    const perms = a.role?.permissions || {};
    for (const [key, val] of Object.entries(perms)) {
      if (val === true) merged[key] = true;
    }
  }

  if (!Object.keys(merged).length) {
    const legacyKey = String(user.role || '').toLowerCase();
    const flags = LEGACY_VIEW_DEFAULTS[legacyKey];
    if (flags) {
      const modulePerms = buildPermissionsFromModuleFlags(flags, {
        adminLevel:
          legacyKey === 'admin' || legacyKey === 'superadmin' || legacyKey === 'director',
      });
      const financePerms = buildFinancePagePermissions({
        legacyRoleKey: legacyKey,
        adminLevel:
          legacyKey === 'admin' || legacyKey === 'superadmin' || legacyKey === 'director',
      });
      const fallback = { ...modulePerms, ...financePerms };
      return user.role === UserRole.TEACHER
        ? reconcileTeacherPeopleRecordsPermissions(fallback, { slug: 'teacher', legacyRoleKey: 'teacher' })
        : fallback;
    }
  }

  if (user.role === UserRole.TEACHER) {
    return reconcileTeacherPeopleRecordsPermissions(merged, { slug: 'teacher', legacyRoleKey: 'teacher' });
  }

  return merged;
}

export async function userHasPermission(
  user: User,
  module: string,
  action: RbacAction | string
): Promise<boolean> {
  if (FULL_ACCESS_ROLES.has(user.role)) return true;
  const perms = await resolveUserPermissions(user);
  const key = permissionKey(module, action);
  return perms[key] === true;
}

export async function getUsersWithRoles(): Promise<any[]> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  const userRepo = AppDataSource.getRepository(User);
  const users = await userRepo.find({
    order: { createdAt: 'DESC' },
    take: 500,
    relations: ['student', 'teacher', 'parent'],
  });

  const urRepo = AppDataSource.getRepository(UserRbacRole);
  const assignments = await urRepo.find({ relations: ['role'] });
  const byUser = new Map<string, RbacRole[]>();
  for (const a of assignments) {
    if (!a.role) continue;
    const list = byUser.get(a.userId) || [];
    list.push(a.role);
    byUser.set(a.userId, list);
  }

  return users.map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    fullName:
      u.teacher
        ? [u.teacher.firstName, u.teacher.lastName].filter(Boolean).join(' ')
        : u.student
          ? [u.student.firstName, u.student.lastName].filter(Boolean).join(' ')
          : u.parent
            ? [u.parent.firstName, u.parent.lastName].filter(Boolean).join(' ')
            : [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username,
    rbacRoles: (byUser.get(u.id) || []).map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
    })),
  }));
}

export async function assignRolesToUser(userId: string, roleIds: string[]): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  const urRepo = AppDataSource.getRepository(UserRbacRole);
  const roleRepo = AppDataSource.getRepository(RbacRole);

  await urRepo.delete({ userId });

  if (!roleIds.length) return;

  const roles = await roleRepo.find({ where: { id: In(roleIds) } });
  for (const role of roles) {
    await urRepo.save(urRepo.create({ userId, roleId: role.id }));
  }
}
