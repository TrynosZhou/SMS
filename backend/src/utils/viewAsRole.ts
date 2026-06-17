import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';

const ROLE_PREVIEW_USERS = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.SUPERADMIN,
  UserRole.DIRECTOR,
]);

export function getViewAsRoleHeader(req: AuthRequest): string | null {
  const raw = String(req.headers['x-view-as-role'] || '').trim().toLowerCase();
  return raw || null;
}

export function canUseRolePreview(req: AuthRequest): boolean {
  if (!req.user) return false;
  return ROLE_PREVIEW_USERS.has(req.user.role);
}

export function isRolePreviewActive(req: AuthRequest): boolean {
  return canUseRolePreview(req) && !!getViewAsRoleHeader(req);
}

export function isPreviewingRole(req: AuthRequest, role: string): boolean {
  return isRolePreviewActive(req) && getViewAsRoleHeader(req) === String(role).toLowerCase();
}

export function previewParentProfile() {
  return {
    id: 'preview',
    firstName: 'Preview',
    lastName: 'Parent',
    email: '',
    phoneNumber: '',
    address: '',
    gender: null,
    fullName: 'Preview Parent',
  };
}

export function previewTeacherProfile() {
  return {
    id: null,
    teacherId: 'PREVIEW',
    firstName: 'Preview',
    lastName: 'Teacher',
    fullName: 'Preview Teacher',
    sex: null,
    subjects: [],
    classes: [],
  };
}
