import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppDataSource } from '../config/database';
import { RbacRole } from '../entities/RbacRole';
import { User, UserRole } from '../entities/User';
import { RBAC_ACTIONS, RBAC_MODULES, RBAC_MODULE_GROUPS } from '../constants/rbac';
import { FINANCE_PAGE_ACTIONS, FINANCE_PAGE_GROUPS, FINANCE_PAGES } from '../constants/financeRbac';
import { RBAC_ROLE_GROUPS } from '../constants/userRoles';
import {
  assignRolesToUser,
  ensureRbacSeeded,
  getUsersWithRoles,
  reconcileTeacherPeopleRecordsPermissions,
  resolveUserPermissions,
} from '../services/rbac.service';

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const getRbacCatalog = async (_req: AuthRequest, res: Response) => {
  try {
    res.json({
      modules: RBAC_MODULES,
      moduleGroups: RBAC_MODULE_GROUPS,
      actions: RBAC_ACTIONS,
      financePages: FINANCE_PAGES,
      financePageActions: FINANCE_PAGE_ACTIONS,
      financePageGroups: FINANCE_PAGE_GROUPS,
      roleGroups: RBAC_ROLE_GROUPS,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to load RBAC catalog' });
  }
};

export const listRoles = async (_req: AuthRequest, res: Response) => {
  try {
    const roleRepo = AppDataSource.getRepository(RbacRole);
    const roles = await roleRepo.find({ order: { name: 'ASC' } });
    res.json({ roles });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to list roles' });
  }
};

export const createRole = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, permissions } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Role name is required' });
    }

    const roleRepo = AppDataSource.getRepository(RbacRole);
    let slug = slugify(String(name));
    const existingSlug = await roleRepo.findOne({ where: { slug } });
    if (existingSlug) slug = `${slug}-${Date.now()}`;

    const role = roleRepo.create({
      name: String(name).trim(),
      slug,
      description: description ? String(description).trim() : null,
      isSystem: false,
      legacyRoleKey: null,
      permissions: permissions && typeof permissions === 'object' ? permissions : {},
    });
    await roleRepo.save(role);
    res.status(201).json({ role, message: 'Role created successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to create role' });
  }
};

export const updateRole = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, permissions } = req.body || {};
    const roleRepo = AppDataSource.getRepository(RbacRole);
    const role = await roleRepo.findOne({ where: { id } });
    if (!role) return res.status(404).json({ message: 'Role not found' });

    if (name) role.name = String(name).trim();
    if (description !== undefined) role.description = description ? String(description).trim() : null;
    if (permissions && typeof permissions === 'object') {
      const cleaned: Record<string, boolean> = {};
      for (const [key, val] of Object.entries(permissions)) {
        if (typeof key !== 'string' || !key.includes('.')) continue;
        cleaned[key] = val === true;
      }
      role.permissions = reconcileTeacherPeopleRecordsPermissions(cleaned, {
        slug: role.slug,
        legacyRoleKey: role.legacyRoleKey,
      });
    }
    await roleRepo.save(role);
    res.json({ role, message: 'Role updated successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to update role' });
  }
};

export const deleteRole = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const roleRepo = AppDataSource.getRepository(RbacRole);
    const role = await roleRepo.findOne({ where: { id } });
    if (!role) return res.status(404).json({ message: 'Role not found' });
    if (role.isSystem) {
      return res.status(400).json({ message: 'System roles cannot be deleted' });
    }
    await roleRepo.remove(role);
    res.json({ message: 'Role deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to delete role' });
  }
};

export const listUsersWithRoles = async (_req: AuthRequest, res: Response) => {
  try {
    const users = await getUsersWithRoles();
    res.json({ users });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to list users' });
  }
};

export const updateUserRoles = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { roleIds } = req.body || {};
    if (!Array.isArray(roleIds)) {
      return res.status(400).json({ message: 'roleIds array is required' });
    }

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (
      user.role === UserRole.SUPERADMIN &&
      req.user?.role !== UserRole.SUPERADMIN &&
      req.user?.role !== UserRole.DIRECTOR
    ) {
      return res.status(403).json({ message: 'Cannot modify superadmin role assignments' });
    }

    await assignRolesToUser(userId, roleIds);
    const permissions = await resolveUserPermissions(user);
    res.json({ message: 'User roles updated', permissions });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to update user roles' });
  }
};

export const getMyPermissions = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const permissions = await resolveUserPermissions(req.user);
    res.json({ permissions, role: req.user.role });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to resolve permissions' });
  }
};
