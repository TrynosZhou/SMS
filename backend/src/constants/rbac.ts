/** Granular permission actions supported across the system */
export const RBAC_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export'] as const;
export type RbacAction = (typeof RBAC_ACTIONS)[number];

export type RbacModuleDef = {
  key: string;
  label: string;
  routeModule?: string;
  group?: string;
  description?: string;
};

/** Matrix section groupings (Permissions & Roles UI) */
export const RBAC_MODULE_GROUPS: { key: string; label: string }[] = [
  { key: 'core', label: 'Core' },
  { key: 'people', label: 'People & registration records' },
  { key: 'academic', label: 'Academic' },
  { key: 'financeOps', label: 'Finance & operations' },
  { key: 'communication', label: 'Communication' },
  { key: 'administration', label: 'Administration' },
];

/** Feature modules that can be permission-controlled */
export const RBAC_MODULES: RbacModuleDef[] = [
  { key: 'dashboard', label: 'Dashboard', routeModule: 'dashboard', group: 'core' },
  {
    key: 'staff',
    label: 'Teacher Records',
    routeModule: 'teachers',
    group: 'people',
    description: 'Registration → Teachers menu, teacher list, profiles, and accounts',
  },
  {
    key: 'parents',
    label: 'Parent Records',
    routeModule: 'parents',
    group: 'people',
    description: 'Registration → Parents menu and parent management',
  },
  { key: 'students', label: 'Student Records', routeModule: 'students', group: 'people' },
  { key: 'attendance', label: 'Attendance', routeModule: 'attendance', group: 'academic' },
  { key: 'timetable', label: 'Timetable', routeModule: 'timetable', group: 'academic' },
  { key: 'exams', label: 'Exams & Results', routeModule: 'exams', group: 'academic' },
  { key: 'reportCards', label: 'Report Cards', routeModule: 'reportCards', group: 'academic' },
  { key: 'rankings', label: 'Rankings', routeModule: 'rankings', group: 'academic' },
  { key: 'classes', label: 'Classes', routeModule: 'classes', group: 'academic' },
  { key: 'subjects', label: 'Subjects', routeModule: 'subjects', group: 'academic' },
  { key: 'recordBook', label: 'Record Book', routeModule: 'recordBook', group: 'academic' },
  { key: 'finance', label: 'Finance / Fees', routeModule: 'finance', group: 'financeOps' },
  { key: 'payroll', label: 'Payroll', routeModule: 'payroll', group: 'financeOps' },
  { key: 'reports', label: 'Reports', routeModule: 'reports', group: 'financeOps' },
  { key: 'library', label: 'Library / Inventory', routeModule: 'inventory', group: 'financeOps' },
  { key: 'logistics', label: 'Transport & Dining', routeModule: 'logistics', group: 'financeOps' },
  { key: 'notices', label: 'Notices / Announcements', routeModule: 'news', group: 'communication' },
  { key: 'messages', label: 'Messages', routeModule: 'messages', group: 'communication' },
  { key: 'settings', label: 'System Settings', routeModule: 'settings', group: 'administration' },
  { key: 'accounts', label: 'User Accounts', routeModule: 'accounts', group: 'administration' },
  { key: 'audit', label: 'Audit & Logs', routeModule: 'audit', group: 'administration' },
];

export const permissionKey = (module: string, action: string): string => `${module}.${action}`;

export const parsePermissionKey = (key: string): { module: string; action: string } => {
  const [module, ...rest] = key.split('.');
  return { module, action: rest.join('.') };
};

/** HTTP method → default action mapping for route enforcement */
export const httpMethodToAction = (method: string): RbacAction => {
  switch (method.toUpperCase()) {
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'edit';
    case 'DELETE':
      return 'delete';
    default:
      return 'view';
  }
};
