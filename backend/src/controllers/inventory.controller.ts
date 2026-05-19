import { Response } from 'express';
import { FindOptionsWhere, In } from 'typeorm';
import { AuthRequest } from '../middleware/auth';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/User';
import { Settings } from '../entities/Settings';
import { Student } from '../entities/Student';
import { Teacher } from '../entities/Teacher';
import { InventoryTextbookCatalog } from '../entities/InventoryTextbookCatalog';
import { InventoryFurnitureItem } from '../entities/InventoryFurnitureItem';
import { InventoryTextbookIssuance } from '../entities/InventoryTextbookIssuance';
import { InventoryFurnitureIssuance } from '../entities/InventoryFurnitureIssuance';
import { InventoryFine } from '../entities/InventoryFine';
import { InventoryAuditLog } from '../entities/InventoryAuditLog';
import { InventoryTeacherTextbookAllocation } from '../entities/InventoryTeacherTextbookAllocation';
import { InventoryTeacherFurnitureAllocation } from '../entities/InventoryTeacherFurnitureAllocation';
import {
  canUserManageInventory,
  canUserViewInventoryReports,
  loadSettingsRow,
  resolveInventoryConfig,
  writeInventoryAudit
} from '../utils/inventoryAccess';

function parseDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Physical condition for textbook copies (teacher modal): Good | Lost | Torn */
function textbookPhysicalConditionLabel(raw: string | null | undefined): 'Good' | 'Lost' | 'Torn' {
  const s = String(raw || 'good').trim().toLowerCase();
  if (s === 'lost' || s === 'missing') return 'Lost';
  if (s === 'torn' || s === 'ripped' || s === 'damaged' || s === 'poor') return 'Torn';
  return 'Good';
}

/** Furniture asset condition (teacher modal): Good | Damaged | Lost */
function furnitureConditionDisplayLabel(raw: string | null | undefined): 'Good' | 'Damaged' | 'Lost' {
  const s = String(raw || 'good').trim().toLowerCase();
  if (s === 'lost' || s === 'missing') return 'Lost';
  if (s === 'damaged' || s === 'broken' || s === 'poor') return 'Damaged';
  return 'Good';
}

function parseTeacherTextbookConditionInput(input: unknown): 'good' | 'lost' | 'torn' | null {
  const k = String(input ?? '')
    .trim()
    .toLowerCase();
  if (k === 'good' || k === 'lost' || k === 'torn') return k;
  return null;
}

function parseTeacherFurnitureConditionInput(input: unknown): 'good' | 'damaged' | 'lost' | null {
  const k = String(input ?? '')
    .trim()
    .toLowerCase();
  if (k === 'good' || k === 'damaged' || k === 'lost') return k;
  return null;
}

async function getTeacherScopedStudentIds(teacherUserId: string): Promise<string[]> {
  const teacher = await AppDataSource.getRepository(Teacher).findOneBy({ userId: teacherUserId });
  if (!teacher) return [];
  const { Class } = await import('../entities/Class');
  const ownedClasses = await AppDataSource.getRepository(Class).find({
    where: [{ classTeacher1Id: teacher.id }, { classTeacher2Id: teacher.id }]
  });
  let classIds = ownedClasses.map(c => c.id);
  if (!classIds.length) {
    const { getTeacherClassIds } = await import('../utils/teacherClassLinker');
    classIds = await getTeacherClassIds(teacher.id);
  }
  if (!classIds.length) return [];
  const students = await AppDataSource.getRepository(Student)
    .createQueryBuilder('s')
    .where('s.classId IN (:...classIds)', { classIds })
    .andWhere('s.isActive = true')
    .getMany();
  return students.map(s => s.id);
}

async function teacherCanUpdateFurnitureItem(userId: string, furnitureItemId: string): Promise<boolean> {
  const hasAlloc = await AppDataSource.getRepository(InventoryTeacherFurnitureAllocation).findOne({
    where: { furnitureItemId, teacherUserId: userId }
  });
  if (hasAlloc) return true;
  const activeIss = await AppDataSource.getRepository(InventoryFurnitureIssuance).findOne({
    where: { furnitureItemId, status: 'active' as any }
  });
  if (!activeIss) return false;
  const scoped = await getTeacherScopedStudentIds(userId);
  return scoped.includes(activeIss.studentId);
}

async function requireManage(req: AuthRequest, res: Response): Promise<Settings | null> {
  const settings = await loadSettingsRow();
  if (!req.user || !canUserManageInventory(req.user, settings)) {
    res.status(403).json({ message: 'Inventory management not allowed for this account' });
    return null;
  }
  return settings;
}

async function requireReports(req: AuthRequest, res: Response): Promise<boolean> {
  const settings = await loadSettingsRow();
  if (!req.user || !canUserViewInventoryReports(req.user, settings)) {
    res.status(403).json({ message: 'Inventory reports not allowed' });
    return false;
  }
  return true;
}

function studentSelfId(req: AuthRequest): string | null {
  const u = req.user;
  if (!u || u.role !== UserRole.STUDENT || !u.student?.id) return null;
  return u.student.id;
}

/* ---------- Settings ---------- */
export const getInventorySettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireReports(req, res))) return;
    const cfg = await resolveInventoryConfig();
    const row = await loadSettingsRow();
    res.json({ ...cfg, raw: row?.inventorySettings || null });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const putInventorySettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'Only administrators can update inventory settings' });
    }
    const repo = AppDataSource.getRepository(Settings);
    let row = (await repo.find({ take: 1, order: { updatedAt: 'DESC' } }))[0];
    if (!row) {
      row = repo.create({});
      await repo.save(row);
    }
    const body = req.body || {};
    row.inventorySettings = {
      ...(row.inventorySettings || {}),
      ...(body.loanDaysDefault !== undefined ? { loanDaysDefault: Number(body.loanDaysDefault) } : {}),
      ...(body.overdueFinePerDay !== undefined ? { overdueFinePerDay: Number(body.overdueFinePerDay) } : {}),
      ...(body.lossGraceDaysAfterDue !== undefined ? { lossGraceDaysAfterDue: Number(body.lossGraceDaysAfterDue) } : {})
    };
    await repo.save(row);
    await writeInventoryAudit(req.user.id, 'inventory.settings.update', 'settings', row.id, row.inventorySettings as any);
    res.json({ success: true, inventorySettings: row.inventorySettings });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---------- Textbook catalog ---------- */
export const listTextbooks = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireReports(req, res))) return;
    const list = await AppDataSource.getRepository(InventoryTextbookCatalog).find({
      relations: ['subject'],
      order: { title: 'ASC' }
    });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const createTextbook = async (req: AuthRequest, res: Response) => {
  try {
    const settings = await requireManage(req, res);
    if (!settings || !req.user) return;
    const { title, isbn, subjectId, gradeLevel, condition, quantityTotal } = req.body;
    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: 'Title is required' });
    }
    const total = Math.max(0, parseInt(String(quantityTotal ?? 0), 10) || 0);
    const catalog = AppDataSource.getRepository(InventoryTextbookCatalog).create({
      title: String(title).trim(),
      isbn: isbn ? String(isbn).trim() : null,
      subjectId: subjectId || null,
      gradeLevel: gradeLevel ? String(gradeLevel).trim() : null,
      condition: condition ? String(condition) : 'good',
      quantityTotal: total,
      quantityAvailable: total
    });
    await AppDataSource.getRepository(InventoryTextbookCatalog).save(catalog);
    await writeInventoryAudit(req.user.id, 'textbook.catalog.create', 'textbook_catalog', catalog.id, { title: catalog.title });
    res.status(201).json(catalog);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const updateTextbook = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireManage(req, res))) return;
    if (!req.user) return;
    const { id } = req.params;
    const repo = AppDataSource.getRepository(InventoryTextbookCatalog);
    const row = await repo.findOne({ where: { id } });
    if (!row) return res.status(404).json({ message: 'Not found' });
    const { title, isbn, subjectId, gradeLevel, condition, quantityTotal } = req.body;
    if (title !== undefined) row.title = String(title).trim();
    if (isbn !== undefined) row.isbn = isbn ? String(isbn).trim() : null;
    if (subjectId !== undefined) row.subjectId = subjectId || null;
    if (gradeLevel !== undefined) row.gradeLevel = gradeLevel ? String(gradeLevel).trim() : null;
    if (condition !== undefined) row.condition = String(condition);
    if (quantityTotal !== undefined) {
      const total = Math.max(0, parseInt(String(quantityTotal), 10) || 0);
      const issued = row.quantityTotal - row.quantityAvailable;
      row.quantityTotal = total;
      row.quantityAvailable = Math.max(0, total - issued);
    }
    await repo.save(row);
    await writeInventoryAudit(req.user.id, 'textbook.catalog.update', 'textbook_catalog', row.id, {});
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const deleteTextbook = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireManage(req, res))) return;
    if (!req.user) return;
    const { id } = req.params;
    const active = await AppDataSource.getRepository(InventoryTextbookIssuance).count({
      where: { catalogId: id, status: In(['active', 'overdue']) as any }
    });
    if (active > 0) {
      return res.status(400).json({ message: 'Cannot delete catalog with active issuances' });
    }
    await AppDataSource.getRepository(InventoryTextbookCatalog).delete({ id });
    await writeInventoryAudit(req.user.id, 'textbook.catalog.delete', 'textbook_catalog', id, {});
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---------- Furniture ---------- */
export const listFurniture = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireReports(req, res))) return;
    const list = await AppDataSource.getRepository(InventoryFurnitureItem).find({ order: { itemCode: 'ASC' } });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const createFurniture = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireManage(req, res))) return;
    if (!req.user) return;
    const { itemType, itemCode, condition, locationLabel } = req.body;
    if (itemType !== 'desk' && itemType !== 'chair') {
      return res.status(400).json({ message: 'itemType must be desk or chair' });
    }
    if (!itemCode || !String(itemCode).trim()) {
      return res.status(400).json({ message: 'itemCode is required' });
    }
    const item = AppDataSource.getRepository(InventoryFurnitureItem).create({
      itemType,
      itemCode: String(itemCode).trim(),
      condition: condition ? String(condition) : 'good',
      locationLabel: locationLabel ? String(locationLabel) : null,
      status: 'available'
    });
    await AppDataSource.getRepository(InventoryFurnitureItem).save(item);
    await writeInventoryAudit(req.user.id, 'furniture.create', 'furniture', item.id, { itemCode: item.itemCode });
    res.status(201).json(item);
  } catch (e: any) {
    if (String(e?.message || '').includes('duplicate') || e?.code === '23505') {
      return res.status(409).json({ message: 'Item code already exists' });
    }
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const updateFurniture = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireManage(req, res))) return;
    if (!req.user) return;
    const { id } = req.params;
    const repo = AppDataSource.getRepository(InventoryFurnitureItem);
    const row = await repo.findOne({ where: { id } });
    if (!row) return res.status(404).json({ message: 'Not found' });
    const { itemType, itemCode, condition, locationLabel, status } = req.body;
    if (itemType === 'desk' || itemType === 'chair') row.itemType = itemType;
    if (itemCode !== undefined) row.itemCode = String(itemCode).trim();
    if (condition !== undefined) row.condition = String(condition);
    if (locationLabel !== undefined) row.locationLabel = locationLabel ? String(locationLabel) : null;
    if (status && ['available', 'issued', 'damaged', 'lost'].includes(status)) row.status = status;
    await repo.save(row);
    await writeInventoryAudit(req.user.id, 'furniture.update', 'furniture', row.id, {});
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const deleteFurniture = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireManage(req, res))) return;
    if (!req.user) return;
    const { id } = req.params;
    const active = await AppDataSource.getRepository(InventoryFurnitureIssuance).count({
      where: { furnitureItemId: id, status: 'active' as any }
    });
    if (active > 0) {
      return res.status(400).json({ message: 'Cannot delete furniture with active issuance' });
    }
    await AppDataSource.getRepository(InventoryFurnitureItem).delete({ id });
    await writeInventoryAudit(req.user.id, 'furniture.delete', 'furniture', id, {});
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---------- Textbook issue / return ---------- */
export const issueTextbookPermanent = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireManage(req, res))) return;
    if (!req.user) return;
    const { catalogId } = req.params;
    const { studentId, notes } = req.body;
    if (!studentId) return res.status(400).json({ message: 'studentId required' });
    const student = await AppDataSource.getRepository(Student).findOne({ where: { id: studentId } });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const catalog = await AppDataSource.getRepository(InventoryTextbookCatalog).findOne({ where: { id: catalogId } });
    if (!catalog) return res.status(404).json({ message: 'Catalog not found' });
    if (catalog.quantityAvailable < 1) return res.status(400).json({ message: 'No copies available' });
    const dup = await AppDataSource.getRepository(InventoryTextbookIssuance).findOne({
      where: {
        catalogId,
        studentId,
        issuanceType: 'permanent',
        status: 'active'
      } as FindOptionsWhere<InventoryTextbookIssuance>
    });
    if (dup) {
      return res.status(400).json({ message: 'Student already has an active permanent copy of this title' });
    }
    catalog.quantityAvailable -= 1;
    await AppDataSource.getRepository(InventoryTextbookCatalog).save(catalog);
    const iss = AppDataSource.getRepository(InventoryTextbookIssuance).create({
      catalogId,
      studentId,
      issuanceType: 'permanent',
      loanDueAt: null,
      status: 'active',
      authorizedByUserId: req.user.id,
      notes: notes ? String(notes) : null
    });
    await AppDataSource.getRepository(InventoryTextbookIssuance).save(iss);
    await writeInventoryAudit(req.user.id, 'textbook.issue.permanent', 'textbook_issuance', iss.id, { catalogId, studentId });
    res.status(201).json(iss);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const borrowTextbook = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireManage(req, res))) return;
    if (!req.user) return;
    const { catalogId } = req.params;
    const { studentId, loanDueAt, notes } = req.body;
    if (!studentId) return res.status(400).json({ message: 'studentId required' });
    const student = await AppDataSource.getRepository(Student).findOne({ where: { id: studentId } });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const catalog = await AppDataSource.getRepository(InventoryTextbookCatalog).findOne({ where: { id: catalogId } });
    if (!catalog) return res.status(404).json({ message: 'Catalog not found' });
    if (catalog.quantityAvailable < 1) return res.status(400).json({ message: 'No copies available' });
    const cfg = await resolveInventoryConfig();
    const due = loanDueAt ? new Date(loanDueAt) : new Date(Date.now() + cfg.loanDaysDefault * 86400000);
    catalog.quantityAvailable -= 1;
    await AppDataSource.getRepository(InventoryTextbookCatalog).save(catalog);
    const iss = AppDataSource.getRepository(InventoryTextbookIssuance).create({
      catalogId,
      studentId,
      issuanceType: 'loan',
      loanDueAt: due,
      status: 'active',
      authorizedByUserId: req.user.id,
      notes: notes ? String(notes) : null
    });
    await AppDataSource.getRepository(InventoryTextbookIssuance).save(iss);
    await writeInventoryAudit(req.user.id, 'textbook.issue.loan', 'textbook_issuance', iss.id, { due });
    res.status(201).json(iss);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const returnTextbookIssuance = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireManage(req, res))) return;
    if (!req.user) return;
    const { id } = req.params;
    const issRepo = AppDataSource.getRepository(InventoryTextbookIssuance);
    const iss = await issRepo.findOne({ where: { id }, relations: ['catalog'] });
    if (!iss) return res.status(404).json({ message: 'Issuance not found' });
    if (iss.status !== 'active' && iss.status !== 'overdue') {
      return res.status(400).json({ message: 'Issuance is not active' });
    }
    const now = new Date();
    iss.returnedAt = now;
    iss.status = 'returned';
    if (iss.issuanceType === 'loan' && iss.loanDueAt && now > iss.loanDueAt) {
      const days = Math.ceil((now.getTime() - iss.loanDueAt.getTime()) / 86400000);
      const cfg = await resolveInventoryConfig();
      const amount = Math.round(days * cfg.overdueFinePerDay * 100) / 100;
      if (amount > 0) {
        const fine = AppDataSource.getRepository(InventoryFine).create({
          studentId: iss.studentId,
          fineType: 'loan_overdue',
          amount,
          daysOverdue: days,
          dailyRateSnapshot: String(cfg.overdueFinePerDay),
          textbookIssuanceId: iss.id,
          furnitureIssuanceId: null,
          assessedByUserId: req.user.id,
          description: `Overdue library loan (${days} day(s))`,
          status: 'pending'
        });
        await AppDataSource.getRepository(InventoryFine).save(fine);
      }
    }
    iss.catalog.quantityAvailable += 1;
    await AppDataSource.getRepository(InventoryTextbookCatalog).save(iss.catalog);
    await issRepo.save(iss);
    await writeInventoryAudit(req.user.id, 'textbook.return', 'textbook_issuance', iss.id, {});
    res.json(iss);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const markTextbookLost = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireManage(req, res))) return;
    if (!req.user) return;
    const { id } = req.params;
    const issRepo = AppDataSource.getRepository(InventoryTextbookIssuance);
    const iss = await issRepo.findOne({ where: { id }, relations: ['catalog'] });
    if (!iss) return res.status(404).json({ message: 'Issuance not found' });
    if (iss.status !== 'active' && iss.status !== 'overdue') {
      return res.status(400).json({ message: 'Issuance is not active' });
    }
    iss.status = 'lost';
    iss.lostReportedAt = new Date();
    iss.catalog.quantityTotal = Math.max(0, iss.catalog.quantityTotal - 1);
    await AppDataSource.getRepository(InventoryTextbookCatalog).save(iss.catalog);
    await issRepo.save(iss);
    await writeInventoryAudit(req.user.id, 'textbook.lost', 'textbook_issuance', iss.id, { studentId: iss.studentId });
    res.json(iss);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---------- Furniture issue / return ---------- */
export const issueFurniture = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireManage(req, res))) return;
    if (!req.user) return;
    const { furnitureId } = req.params;
    const { studentId, notes } = req.body;
    if (!studentId) return res.status(400).json({ message: 'studentId required' });
    const student = await AppDataSource.getRepository(Student).findOne({ where: { id: studentId } });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const item = await AppDataSource.getRepository(InventoryFurnitureItem).findOne({ where: { id: furnitureId } });
    if (!item) return res.status(404).json({ message: 'Furniture not found' });
    if (item.status !== 'available') {
      return res.status(400).json({ message: 'Item is not available' });
    }
    const existing = await AppDataSource.getRepository(InventoryFurnitureIssuance).findOne({
      where: { furnitureItemId: furnitureId, status: 'active' as any }
    });
    if (existing) return res.status(400).json({ message: 'Item already issued' });
    item.status = 'issued';
    await AppDataSource.getRepository(InventoryFurnitureItem).save(item);
    const iss = AppDataSource.getRepository(InventoryFurnitureIssuance).create({
      furnitureItemId: furnitureId,
      studentId,
      status: 'active',
      authorizedByUserId: req.user.id,
      notes: notes ? String(notes) : null
    });
    await AppDataSource.getRepository(InventoryFurnitureIssuance).save(iss);
    await writeInventoryAudit(req.user.id, 'furniture.issue', 'furniture_issuance', iss.id, { studentId, furnitureId });
    res.status(201).json(iss);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const returnFurnitureIssuance = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireManage(req, res))) return;
    if (!req.user) return;
    const { id } = req.params;
    const issRepo = AppDataSource.getRepository(InventoryFurnitureIssuance);
    const iss = await issRepo.findOne({ where: { id }, relations: ['furnitureItem'] });
    if (!iss) return res.status(404).json({ message: 'Issuance not found' });
    if (iss.status !== 'active') {
      return res.status(400).json({ message: 'Issuance is not active' });
    }
    const now = new Date();
    iss.returnedAt = now;
    iss.status = 'returned';
    iss.furnitureItem.status = 'available';
    await AppDataSource.getRepository(InventoryFurnitureItem).save(iss.furnitureItem);
    await issRepo.save(iss);
    await writeInventoryAudit(req.user.id, 'furniture.return', 'furniture_issuance', iss.id, {});
    res.json(iss);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const markFurnitureLost = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireManage(req, res))) return;
    if (!req.user) return;
    const { id } = req.params;
    const issRepo = AppDataSource.getRepository(InventoryFurnitureIssuance);
    const iss = await issRepo.findOne({ where: { id }, relations: ['furnitureItem'] });
    if (!iss) return res.status(404).json({ message: 'Issuance not found' });
    if (iss.status !== 'active') {
      return res.status(400).json({ message: 'Issuance is not active' });
    }
    iss.status = 'lost';
    iss.lostReportedAt = new Date();
    iss.furnitureItem.status = 'lost';
    await AppDataSource.getRepository(InventoryFurnitureItem).save(iss.furnitureItem);
    await issRepo.save(iss);
    await writeInventoryAudit(req.user.id, 'furniture.lost', 'furniture_issuance', iss.id, {
      studentId: iss.studentId
    });
    res.json(iss);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---------- Lists for UI ---------- */
export const listTextbookIssuances = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireReports(req, res))) return;
    const { studentId, status } = req.query as any;
    const where: FindOptionsWhere<InventoryTextbookIssuance> = {};
    if (studentId) where.studentId = String(studentId);
    if (status) where.status = String(status) as any;
    const list = await AppDataSource.getRepository(InventoryTextbookIssuance).find({
      where,
      relations: ['catalog', 'student', 'authorizedBy'],
      order: { createdAt: 'DESC' }
    });
    await refreshOverdueLoans(list);
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const listFurnitureIssuances = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireReports(req, res))) return;
    const { studentId, status } = req.query as any;
    const where: FindOptionsWhere<InventoryFurnitureIssuance> = {};
    if (studentId) where.studentId = String(studentId);
    if (status) where.status = String(status) as any;
    const list = await AppDataSource.getRepository(InventoryFurnitureIssuance).find({
      where,
      relations: ['furnitureItem', 'student', 'authorizedBy'],
      order: { issuedAt: 'DESC' }
    });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

async function refreshOverdueLoans(list: InventoryTextbookIssuance[]) {
  const repo = AppDataSource.getRepository(InventoryTextbookIssuance);
  const now = new Date();
  for (const iss of list) {
    if (
      iss.issuanceType === 'loan' &&
      iss.status === 'active' &&
      iss.loanDueAt &&
      now > iss.loanDueAt
    ) {
      iss.status = 'overdue' as any;
      await repo.save(iss);
    }
  }
}

/* ---------- Fines ---------- */
export const createInventoryFine = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const settings = await loadSettingsRow();
    const isMgr = canUserManageInventory(req.user, settings);
    const isAcct = req.user.role === UserRole.ACCOUNTANT && settings?.moduleAccess?.accountant?.inventory !== false;
    if (!isMgr && !isAcct && req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.SUPERADMIN) {
      return res.status(403).json({ message: 'Not allowed to create inventory fines' });
    }
    const { studentId, fineType, amount, description, textbookIssuanceId, furnitureIssuanceId } = req.body;
    if (!studentId || !fineType || amount === undefined) {
      return res.status(400).json({ message: 'studentId, fineType, amount required' });
    }
    const allowed = ['loan_overdue', 'furniture_damage', 'lost_book', 'lost_furniture'];
    if (!allowed.includes(fineType)) {
      return res.status(400).json({ message: 'Invalid fineType' });
    }
    const fine = AppDataSource.getRepository(InventoryFine).create({
      studentId,
      fineType,
      amount: Math.round(parseFloat(String(amount)) * 100) / 100,
      description: description ? String(description) : null,
      textbookIssuanceId: textbookIssuanceId || null,
      furnitureIssuanceId: furnitureIssuanceId || null,
      assessedByUserId: req.user.id,
      status: 'pending'
    });
    await AppDataSource.getRepository(InventoryFine).save(fine);
    await writeInventoryAudit(req.user.id, 'fine.create', 'inventory_fine', fine.id, { studentId, amount: fine.amount });
    res.status(201).json(fine);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const updateFineStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (
      req.user.role !== UserRole.ADMIN &&
      req.user.role !== UserRole.SUPERADMIN &&
      req.user.role !== UserRole.ACCOUNTANT
    ) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    const { id } = req.params;
    const { status, invoiceId } = req.body;
    const allowedStatus = ['pending', 'paid', 'waived', 'invoiced'];
    if (!status || !allowedStatus.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const repo = AppDataSource.getRepository(InventoryFine);
    const row = await repo.findOne({ where: { id } });
    if (!row) return res.status(404).json({ message: 'Fine not found' });
    row.status = status;
    if (invoiceId !== undefined) row.invoiceId = invoiceId || null;
    await repo.save(row);
    await writeInventoryAudit(req.user.id, 'fine.status', 'inventory_fine', row.id, { status });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const listInventoryFines = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireReports(req, res))) return;
    const { studentId, status, from, to } = req.query as any;
    const qb = AppDataSource.getRepository(InventoryFine)
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.student', 'student')
      .orderBy('f.createdAt', 'DESC');
    if (studentId) qb.andWhere('f.studentId = :sid', { sid: String(studentId) });
    if (status) qb.andWhere('f.status = :st', { st: String(status) });
    const fromD = parseDate(from);
    const toD = parseDate(to);
    if (fromD && toD) qb.andWhere('f.createdAt BETWEEN :a AND :b', { a: fromD, b: toD });
    else if (fromD) qb.andWhere('f.createdAt >= :a', { a: fromD });
    else if (toD) qb.andWhere('f.createdAt <= :b', { b: toD });
    res.json(await qb.getMany());
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---------- Student summary / self ---------- */
async function buildStudentInventorySummary(studentId: string) {
  const tbRepo = AppDataSource.getRepository(InventoryTextbookIssuance);
  const furnRepo = AppDataSource.getRepository(InventoryFurnitureIssuance);
  const fineRepo = AppDataSource.getRepository(InventoryFine);
  const textbookIssuances = await tbRepo.find({
    where: { studentId },
    relations: ['catalog', 'authorizedBy'],
    order: { createdAt: 'DESC' }
  });
  await refreshOverdueLoans(textbookIssuances);
  const furnitureIssuances = await furnRepo.find({
    where: { studentId },
    relations: ['furnitureItem', 'authorizedBy'],
    order: { issuedAt: 'DESC' }
  });
  const fines = await fineRepo.find({ where: { studentId }, order: { createdAt: 'DESC' } });
  const pendingFines = fines.filter(f => f.status === 'pending');
  const pendingTotal = pendingFines.reduce((s, f) => s + Number(f.amount || 0), 0);
  return {
    textbookIssuances,
    furnitureIssuances,
    fines,
    pendingFinesCount: pendingFines.length,
    pendingFinesTotal: Math.round(pendingTotal * 100) / 100,
    hasUnpaidInventoryFines: pendingFines.length > 0
  };
}

export const getStudentInventorySummary = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId } = req.params;
    if (!studentId) return res.status(400).json({ message: 'studentId required' });
    if (req.user?.role === UserRole.STUDENT) {
      const sid = studentSelfId(req);
      if (!sid || sid !== studentId) {
        return res.status(403).json({ message: 'You can only view your own inventory' });
      }
    } else if (!(await requireReports(req, res))) {
      return;
    }
    const summary = await buildStudentInventorySummary(studentId);
    res.json(summary);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const getMyInventory = async (req: AuthRequest, res: Response) => {
  try {
    const sid = studentSelfId(req);
    if (!sid) return res.status(403).json({ message: 'Student access only' });
    const summary = await buildStudentInventorySummary(sid);
    res.json(summary);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---------- Reports ---------- */
export const reportLostItems = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireReports(req, res))) return;
    const { from, to, studentId, classId } = req.query as any;
    const tbLost = AppDataSource.getRepository(InventoryTextbookIssuance)
      .createQueryBuilder('iss')
      .leftJoinAndSelect('iss.catalog', 'catalog')
      .leftJoinAndSelect('iss.student', 'student')
      .leftJoinAndSelect('student.classEntity', 'cl')
      .where('iss.status = :st', { st: 'lost' });
    if (studentId) tbLost.andWhere('iss.studentId = :sid', { sid: String(studentId) });
    if (classId) tbLost.andWhere('student.classId = :cid', { cid: String(classId) });
    const fromD = parseDate(from);
    const toD = parseDate(to);
    if (fromD && toD) tbLost.andWhere('iss.lostReportedAt BETWEEN :a AND :b', { a: fromD, b: toD });
    else if (fromD) tbLost.andWhere('iss.lostReportedAt >= :a', { a: fromD });
    else if (toD) tbLost.andWhere('iss.lostReportedAt <= :b', { b: toD });
    const textbooks = await tbLost.orderBy('iss.lostReportedAt', 'DESC').getMany();

    const furnLost = AppDataSource.getRepository(InventoryFurnitureIssuance)
      .createQueryBuilder('iss')
      .leftJoinAndSelect('iss.furnitureItem', 'item')
      .leftJoinAndSelect('iss.student', 'student')
      .leftJoinAndSelect('student.classEntity', 'cl')
      .where('iss.status = :st', { st: 'lost' });
    if (studentId) furnLost.andWhere('iss.studentId = :sid', { sid: String(studentId) });
    if (classId) furnLost.andWhere('student.classId = :cid', { cid: String(classId) });
    if (fromD && toD) furnLost.andWhere('iss.lostReportedAt BETWEEN :a AND :b', { a: fromD, b: toD });
    else if (fromD) furnLost.andWhere('iss.lostReportedAt >= :a', { a: fromD });
    else if (toD) furnLost.andWhere('iss.lostReportedAt <= :b', { b: toD });
    const furniture = await furnLost.orderBy('iss.lostReportedAt', 'DESC').getMany();

    res.json({ textbooks, furniture });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const reportTextbookIssuance = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireReports(req, res))) return;
    const { studentId, classId, from, to, status } = req.query as any;
    const qb = AppDataSource.getRepository(InventoryTextbookIssuance)
      .createQueryBuilder('iss')
      .leftJoinAndSelect('iss.catalog', 'catalog')
      .leftJoinAndSelect('iss.student', 'student')
      .leftJoinAndSelect('student.classEntity', 'cl');
    if (studentId) qb.andWhere('iss.studentId = :sid', { sid: String(studentId) });
    if (classId) qb.andWhere('student.classId = :cid', { cid: String(classId) });
    if (status) qb.andWhere('iss.status = :st', { st: String(status) });
    const fromD = parseDate(from);
    const toD = parseDate(to);
    if (fromD && toD) qb.andWhere('iss.createdAt BETWEEN :a AND :b', { a: fromD, b: toD });
    else if (fromD) qb.andWhere('iss.createdAt >= :a', { a: fromD });
    else if (toD) qb.andWhere('iss.createdAt <= :b', { b: toD });
    const list = await qb.orderBy('iss.createdAt', 'DESC').getMany();
    await refreshOverdueLoans(list.filter(i => i.status === 'active'));
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const reportFurnitureIssuance = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireReports(req, res))) return;
    const { studentId, classId, from, to, status, location } = req.query as any;
    const qb = AppDataSource.getRepository(InventoryFurnitureIssuance)
      .createQueryBuilder('iss')
      .leftJoinAndSelect('iss.furnitureItem', 'item')
      .leftJoinAndSelect('iss.student', 'student')
      .leftJoinAndSelect('student.classEntity', 'cl');
    if (studentId) qb.andWhere('iss.studentId = :sid', { sid: String(studentId) });
    if (classId) qb.andWhere('student.classId = :cid', { cid: String(classId) });
    if (status) qb.andWhere('iss.status = :st', { st: String(status) });
    if (location) qb.andWhere('item.locationLabel ILIKE :loc', { loc: `%${String(location)}%` });
    const fromD = parseDate(from);
    const toD = parseDate(to);
    if (fromD && toD) qb.andWhere('iss.issuedAt BETWEEN :a AND :b', { a: fromD, b: toD });
    else if (fromD) qb.andWhere('iss.issuedAt >= :a', { a: fromD });
    else if (toD) qb.andWhere('iss.issuedAt <= :b', { b: toD });
    res.json(await qb.orderBy('iss.issuedAt', 'DESC').getMany());
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const reportLoanHistory = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireReports(req, res))) return;
    const { studentId, classId, from, to } = req.query as any;
    const qb = AppDataSource.getRepository(InventoryTextbookIssuance)
      .createQueryBuilder('iss')
      .leftJoinAndSelect('iss.catalog', 'catalog')
      .leftJoinAndSelect('iss.student', 'student')
      .leftJoinAndSelect('student.classEntity', 'cl')
      .where('iss.issuanceType = :tp', { tp: 'loan' });
    if (studentId) qb.andWhere('iss.studentId = :sid', { sid: String(studentId) });
    if (classId) qb.andWhere('student.classId = :cid', { cid: String(classId) });
    const fromD = parseDate(from);
    const toD = parseDate(to);
    if (fromD && toD) qb.andWhere('iss.createdAt BETWEEN :a AND :b', { a: fromD, b: toD });
    else if (fromD) qb.andWhere('iss.createdAt >= :a', { a: fromD });
    else if (toD) qb.andWhere('iss.createdAt <= :b', { b: toD });
    const list = await qb.orderBy('iss.createdAt', 'DESC').getMany();
    const fineRepo = AppDataSource.getRepository(InventoryFine);
    const withFines = await Promise.all(
      list.map(async iss => {
        const fines = await fineRepo.find({
          where: { textbookIssuanceId: iss.id, fineType: 'loan_overdue' as any }
        });
        return { ...iss, overdueFines: fines };
      })
    );
    res.json(withFines);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

export const listInventoryAudit = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireReports(req, res))) return;
    if (req.user!.role !== UserRole.ADMIN && req.user!.role !== UserRole.SUPERADMIN) {
      return res.status(403).json({ message: 'Audit log: administrators only' });
    }
    const { from, to, entityType } = req.query as any;
    const qb = AppDataSource.getRepository(InventoryAuditLog)
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.user', 'u')
      .orderBy('a.createdAt', 'DESC')
      .take(500);
    if (entityType) qb.andWhere('a.entityType = :et', { et: String(entityType) });
    const fromD = parseDate(from);
    const toD = parseDate(to);
    if (fromD && toD) qb.andWhere('a.createdAt BETWEEN :x AND :y', { x: fromD, y: toD });
    res.json(await qb.getMany());
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ================================================================
   TEACHER ALLOCATION LAYER
   Admin → Teacher (bulk), Teacher → Student (single items)
   ================================================================ */

/** Generate the next sequential code: J0001…J9999 for textbooks, JP0001…JP9999 for furniture */
async function getNextSequentialCode(prefix: 'J' | 'JP'): Promise<string> {
  if (prefix === 'J') {
    const row = await AppDataSource.getRepository(InventoryTextbookIssuance)
      .createQueryBuilder('i')
      .select('i.copyNumber', 'cn')
      .where("i.copyNumber LIKE 'J%'")
      .andWhere("i.copyNumber NOT LIKE 'JP%'")
      .orderBy("i.copyNumber", 'DESC')
      .limit(1)
      .getRawOne();
    const last = row?.cn as string | undefined;
    const num = last ? parseInt(last.replace(/^J/, ''), 10) : 0;
    return `J${String(num + 1).padStart(4, '0')}`;
  } else {
    const row = await AppDataSource.getRepository(InventoryFurnitureItem)
      .createQueryBuilder('f')
      .select('f.itemCode', 'ic')
      .where("f.itemCode LIKE 'JP%'")
      .orderBy("f.itemCode", 'DESC')
      .limit(1)
      .getRawOne();
    const last = row?.ic as string | undefined;
    const num = last ? parseInt(last.replace(/^JP/, ''), 10) : 0;
    return `JP${String(num + 1).padStart(4, '0')}`;
  }
}

async function getNextSequentialCodes(prefix: 'J' | 'JP', count: number): Promise<string[]> {
  const codes: string[] = [];
  // Get the current highest number first
  let startNum: number;
  if (prefix === 'J') {
    const row = await AppDataSource.getRepository(InventoryTextbookIssuance)
      .createQueryBuilder('i')
      .select('i.copyNumber', 'cn')
      .where("i.copyNumber LIKE 'J%'")
      .andWhere("i.copyNumber NOT LIKE 'JP%'")
      .orderBy("i.copyNumber", 'DESC')
      .limit(1)
      .getRawOne();
    startNum = row?.cn ? parseInt((row.cn as string).replace(/^J/, ''), 10) : 0;
  } else {
    const row = await AppDataSource.getRepository(InventoryFurnitureItem)
      .createQueryBuilder('f')
      .select('f.itemCode', 'ic')
      .where("f.itemCode LIKE 'JP%'")
      .orderBy("f.itemCode", 'DESC')
      .limit(1)
      .getRawOne();
    startNum = row?.ic ? parseInt((row.ic as string).replace(/^JP/, ''), 10) : 0;
  }
  for (let i = 1; i <= count; i++) {
    codes.push(`${prefix}${String(startNum + i).padStart(4, '0')}`);
  }
  return codes;
}

/* ---- List all teachers (for admin dropdowns) ---- */
export const listTeachersForInventory = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'Admin only' });
    }
    const teachers = await AppDataSource.getRepository(Teacher).find({
      where: { isActive: true },
      order: { firstName: 'ASC', lastName: 'ASC' }
    });
    res.json(teachers.map(t => ({
      id: t.id,
      userId: t.userId,
      firstName: t.firstName,
      lastName: t.lastName,
      teacherId: t.teacherId
    })));
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---- Admin: bulk issue textbooks to teacher ---- */
export const issueTextbookToTeacher = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'Admin only' });
    }
    const { catalogId } = req.params;
    const { teacherUserId, quantity, notes } = req.body;
    if (!teacherUserId || !quantity || quantity < 1) {
      return res.status(400).json({ message: 'teacherUserId and quantity required' });
    }
    const qty = Number(quantity);
    const catalog = await AppDataSource.getRepository(InventoryTextbookCatalog).findOneBy({ id: catalogId });
    if (!catalog) return res.status(404).json({ message: 'Textbook not found' });
    if (catalog.quantityAvailable < qty) {
      return res.status(400).json({ message: `Only ${catalog.quantityAvailable} copies available` });
    }

    const copyNumbers = await getNextSequentialCodes('J', qty);

    const alloc = AppDataSource.getRepository(InventoryTeacherTextbookAllocation).create({
      catalogId,
      teacherUserId,
      quantity: qty,
      copyNumbers,
      status: 'active',
      authorizedByUserId: req.user.id,
      notes: notes || null
    });
    await AppDataSource.getRepository(InventoryTeacherTextbookAllocation).save(alloc);

    catalog.quantityAvailable -= qty;
    await AppDataSource.getRepository(InventoryTextbookCatalog).save(catalog);

    res.status(201).json({ ...alloc, copyNumbers });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---- Admin: bulk create furniture in stock ---- */
export const bulkCreateFurniture = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'Admin only' });
    }
    const { deskQuantity, chairQuantity, condition, locationLabel } = req.body;
    const desks = Number(deskQuantity) || 0;
    const chairs = Number(chairQuantity) || 0;
    if (desks + chairs < 1) return res.status(400).json({ message: 'Provide at least 1 desk or chair' });

    const repo = AppDataSource.getRepository(InventoryFurnitureItem);
    const created: InventoryFurnitureItem[] = [];

    for (let i = 0; i < desks; i++) {
      const code = await getNextSequentialCode('JP');
      const item = repo.create({ itemType: 'desk', itemCode: code, condition: condition || 'good', locationLabel: locationLabel || null, status: 'available' });
      created.push(await repo.save(item));
    }
    for (let i = 0; i < chairs; i++) {
      const code = await getNextSequentialCode('JP');
      const item = repo.create({ itemType: 'chair', itemCode: code, condition: condition || 'good', locationLabel: locationLabel || null, status: 'available' });
      created.push(await repo.save(item));
    }
    res.status(201).json({ created: created.length, items: created });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---- Admin: bulk create furniture AND allocate to teacher ---- */
export const bulkAllocateFurnitureToTeacher = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.SUPERADMIN)) {
      return res.status(403).json({ message: 'Admin only' });
    }
    const { teacherUserId, deskQuantity, chairQuantity, condition, locationLabel, notes } = req.body;
    if (!teacherUserId) return res.status(400).json({ message: 'teacherUserId required' });
    const desks = Number(deskQuantity) || 0;
    const chairs = Number(chairQuantity) || 0;
    if (desks + chairs < 1) return res.status(400).json({ message: 'Provide at least 1 desk or chair' });

    const furnRepo = AppDataSource.getRepository(InventoryFurnitureItem);
    const allocRepo = AppDataSource.getRepository(InventoryTeacherFurnitureAllocation);
    const allocs: InventoryTeacherFurnitureAllocation[] = [];

    for (let i = 0; i < desks; i++) {
      const code = await getNextSequentialCode('JP');
      const item = await furnRepo.save(furnRepo.create({ itemType: 'desk', itemCode: code, condition: condition || 'good', locationLabel: locationLabel || null, status: 'issued' }));
      const alloc = await allocRepo.save(allocRepo.create({ furnitureItemId: item.id, teacherUserId, status: 'active', authorizedByUserId: req.user.id, notes: notes || null }));
      allocs.push(alloc);
    }
    for (let i = 0; i < chairs; i++) {
      const code = await getNextSequentialCode('JP');
      const item = await furnRepo.save(furnRepo.create({ itemType: 'chair', itemCode: code, condition: condition || 'good', locationLabel: locationLabel || null, status: 'issued' }));
      const alloc = await allocRepo.save(allocRepo.create({ furnitureItemId: item.id, teacherUserId, status: 'active', authorizedByUserId: req.user.id, notes: notes || null }));
      allocs.push(alloc);
    }
    res.status(201).json({ created: allocs.length, allocations: allocs });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---- Admin/Teacher: list teacher textbook allocations ---- */
export const listTeacherTextbookAllocations = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.role;
    const qb = AppDataSource.getRepository(InventoryTeacherTextbookAllocation)
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.catalog', 'catalog')
      .leftJoinAndSelect('a.teacherUser', 'teacher')
      .orderBy('a.createdAt', 'DESC');
    if (role === UserRole.TEACHER) {
      qb.where('a.teacherUserId = :uid', { uid: req.user!.id });
    } else if (req.query.teacherUserId) {
      qb.where('a.teacherUserId = :uid', { uid: String(req.query.teacherUserId) });
    }
    const allocs = await qb.getMany();
    if (!allocs.length) {
      return res.json([]);
    }

    const issuanceRepo = AppDataSource.getRepository(InventoryTextbookIssuance);
    const allocIds = allocs.map(a => a.id);
    const issuances = await issuanceRepo
      .createQueryBuilder('i')
      .where('i.teacherAllocationId IN (:...ids)', { ids: allocIds })
      .getMany();

    const issuanceByAllocCopy = new Map<string, (typeof issuances)[0]>();
    for (const i of issuances) {
      if (i.teacherAllocationId && i.copyNumber) {
        issuanceByAllocCopy.set(`${i.teacherAllocationId}:${i.copyNumber}`, i);
      }
    }

    const withCounts = allocs.map(alloc => {
      const copyNumbers = alloc.copyNumbers || [];
      const issuedSet = new Set(
        issuances.filter(i => i.teacherAllocationId === alloc.id).map(i => i.copyNumber).filter(Boolean) as string[]
      );
      const issuedCopyNumbers = copyNumbers.filter(cn => issuedSet.has(cn));
      const availableCopyNumbers = copyNumbers.filter(cn => !issuedSet.has(cn));
      const quantityDistributed = issuedCopyNumbers.length;
      const totalCopies = copyNumbers.length > 0 ? copyNumbers.length : alloc.quantity || 0;
      const overrides = alloc.copyConditions || {};
      const catalogCond = alloc.catalog?.condition;
      const copyConditionByNumber: Record<string, 'Good' | 'Lost' | 'Torn'> = {};
      for (const cn of copyNumbers) {
        const iss = issuanceByAllocCopy.get(`${alloc.id}:${cn}`);
        if (iss) {
          if (iss.physicalCondition) {
            copyConditionByNumber[cn] = textbookPhysicalConditionLabel(iss.physicalCondition);
          } else if (iss.status === 'lost') {
            copyConditionByNumber[cn] = 'Lost';
          } else {
            const raw = overrides[cn] ?? catalogCond;
            copyConditionByNumber[cn] = textbookPhysicalConditionLabel(raw);
          }
        } else {
          const raw = overrides[cn] ?? catalogCond;
          copyConditionByNumber[cn] = textbookPhysicalConditionLabel(raw);
        }
      }
      const { copyConditions: _omit, ...rest } = alloc as InventoryTeacherTextbookAllocation & { copyConditions?: unknown };
      return {
        ...rest,
        quantityDistributed,
        totalCopies,
        issuedCopyNumbers,
        availableCopyNumbers,
        copyConditionByNumber
      };
    });

    res.json(withCounts);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---- Admin/Teacher: list teacher furniture allocations ---- */
export const listTeacherFurnitureAllocations = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.role;
    const qb = AppDataSource.getRepository(InventoryTeacherFurnitureAllocation)
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.furnitureItem', 'item')
      .leftJoinAndSelect('a.teacherUser', 'teacher')
      .orderBy('a.createdAt', 'DESC');
    if (role === UserRole.TEACHER) {
      qb.where('a.teacherUserId = :uid', { uid: req.user!.id });
    } else if (req.query.teacherUserId) {
      qb.where('a.teacherUserId = :uid', { uid: String(req.query.teacherUserId) });
    }
    const rows = await qb.getMany();
    const enriched = rows.map(a => ({
      ...a,
      conditionLabel: furnitureConditionDisplayLabel(a.furnitureItem?.condition)
    }));
    res.json(enriched);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---- Teacher: issue a textbook copy to a student from their allocation ---- */
export const issueTextbookFromTeacherAllocation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Teacher only' });
    }
    const { allocationId } = req.params;
    const { studentId, issuanceType, loanDueAt, notes } = req.body;
    if (!studentId) return res.status(400).json({ message: 'studentId required' });

    const alloc = await AppDataSource.getRepository(InventoryTeacherTextbookAllocation).findOne({
      where: { id: allocationId, teacherUserId: req.user.id },
      relations: ['catalog']
    });
    if (!alloc) return res.status(404).json({ message: 'Allocation not found or not yours' });
    if (alloc.status !== 'active') return res.status(400).json({ message: 'Allocation is not active' });

    // Find already-issued copy numbers from this allocation
    const alreadyIssued = await AppDataSource.getRepository(InventoryTextbookIssuance).find({
      where: { teacherAllocationId: allocationId } as any
    });
    const usedCopyNumbers = alreadyIssued.map(i => i.copyNumber).filter(Boolean);
    const availableCopyNumbers = (alloc.copyNumbers || []).filter(cn => !usedCopyNumbers.includes(cn));

    if (availableCopyNumbers.length === 0) {
      return res.status(400).json({ message: 'No more copies available in this allocation' });
    }

    // If the teacher selected a specific J-number, use that; otherwise pick the next available
    let copyNumber: string;
    const requestedCopy = req.body.specificCopyNumber as string | undefined;
    if (requestedCopy) {
      if (!(alloc.copyNumbers || []).includes(requestedCopy)) {
        return res.status(400).json({ message: `Copy ${requestedCopy} is not part of this allocation` });
      }
      if (usedCopyNumbers.includes(requestedCopy)) {
        return res.status(400).json({ message: `Copy ${requestedCopy} has already been issued` });
      }
      copyNumber = requestedCopy;
    } else {
      copyNumber = availableCopyNumbers[0];
    }

    const issuance = AppDataSource.getRepository(InventoryTextbookIssuance).create({
      catalogId: alloc.catalogId,
      studentId,
      issuanceType: issuanceType === 'loan' ? 'loan' : 'permanent',
      loanDueAt: loanDueAt ? new Date(loanDueAt) : null,
      status: 'active',
      authorizedByUserId: req.user.id,
      notes: notes || null,
      copyNumber,
      teacherAllocationId: allocationId
    });
    await AppDataSource.getRepository(InventoryTextbookIssuance).save(issuance);

    res.status(201).json({ ...issuance, copyNumber });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---- Teacher: issue furniture to a student from their allocation ---- */
export const issueFurnitureFromTeacherAllocation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Teacher only' });
    }
    const { allocationId } = req.params;
    const { studentId, notes } = req.body;
    if (!studentId) return res.status(400).json({ message: 'studentId required' });

    const alloc = await AppDataSource.getRepository(InventoryTeacherFurnitureAllocation).findOne({
      where: { id: allocationId, teacherUserId: req.user.id },
      relations: ['furnitureItem']
    });
    if (!alloc) return res.status(404).json({ message: 'Allocation not found or not yours' });
    if (alloc.status !== 'active') return res.status(400).json({ message: 'Allocation is not active' });

    // Check item is not already issued to a student
    const existing = await AppDataSource.getRepository(InventoryFurnitureIssuance).findOne({
      where: { furnitureItemId: alloc.furnitureItemId, status: 'active' }
    });
    if (existing) return res.status(400).json({ message: 'This furniture item is already issued to a student' });

    // Enforce one-desk / one-chair per student rule
    const itemType = alloc.furnitureItem?.itemType;
    if (itemType === 'desk' || itemType === 'chair') {
      const alreadyHasSameType = await AppDataSource.getRepository(InventoryFurnitureIssuance)
        .createQueryBuilder('iss')
        .innerJoin(InventoryFurnitureItem, 'item', 'item.id = iss.furnitureItemId')
        .where('iss.studentId = :studentId', { studentId })
        .andWhere('iss.status = :status', { status: 'active' })
        .andWhere('item.itemType = :itemType', { itemType })
        .getOne();
      if (alreadyHasSameType) {
        return res.status(400).json({
          message: `This student already has an active ${itemType} issued to them. Each student may only receive one ${itemType}.`
        });
      }
    }

    const issuance = AppDataSource.getRepository(InventoryFurnitureIssuance).create({
      furnitureItemId: alloc.furnitureItemId,
      studentId,
      status: 'active',
      authorizedByUserId: req.user.id,
      notes: notes || null
    });
    await AppDataSource.getRepository(InventoryFurnitureIssuance).save(issuance);

    // Mark teacher allocation as returned (furniture moved to student)
    alloc.status = 'returned';
    await AppDataSource.getRepository(InventoryTeacherFurnitureAllocation).save(alloc);

    res.status(201).json(issuance);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---- Teacher: return textbook allocation (hand back copies to stock) ---- */
export const returnTeacherTextbookAllocation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Teacher only' });
    }
    const { allocationId } = req.params;
    const alloc = await AppDataSource.getRepository(InventoryTeacherTextbookAllocation).findOne({
      where: { id: allocationId, teacherUserId: req.user.id }
    });
    if (!alloc) return res.status(404).json({ message: 'Allocation not found' });
    const copyNumbers = alloc.copyNumbers || [];
    const issued = await AppDataSource.getRepository(InventoryTextbookIssuance).count({
      where: { teacherAllocationId: allocationId } as any
    });
    const totalCopies = copyNumbers.length > 0 ? copyNumbers.length : alloc.quantity || 0;
    const unusedToReturn = Math.max(0, totalCopies - issued);

    alloc.status = 'returned';
    await AppDataSource.getRepository(InventoryTeacherTextbookAllocation).save(alloc);

    const catalog = await AppDataSource.getRepository(InventoryTextbookCatalog).findOneBy({ id: alloc.catalogId });
    if (catalog && unusedToReturn > 0) {
      catalog.quantityAvailable += unusedToReturn;
      await AppDataSource.getRepository(InventoryTextbookCatalog).save(catalog);
    }
    res.json({ message: 'Returned' });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---- Teacher: return furniture allocation ---- */
export const returnTeacherFurnitureAllocation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Teacher only' });
    }
    const { allocationId } = req.params;
    const alloc = await AppDataSource.getRepository(InventoryTeacherFurnitureAllocation).findOne({
      where: { id: allocationId, teacherUserId: req.user.id }
    });
    if (!alloc) return res.status(404).json({ message: 'Allocation not found' });
    alloc.status = 'returned';
    await AppDataSource.getRepository(InventoryTeacherFurnitureAllocation).save(alloc);

    const item = await AppDataSource.getRepository(InventoryFurnitureItem).findOneBy({ id: alloc.furnitureItemId });
    if (item) { item.status = 'available'; await AppDataSource.getRepository(InventoryFurnitureItem).save(item); }
    res.json({ message: 'Returned' });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---- Teacher: update textbook copy condition (allocation, not yet issued / metadata on copy) ---- */
export const patchTeacherTextbookAllocationCopyCondition = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Teacher only' });
    }
    const { allocationId } = req.params;
    const { copyNumber, condition } = req.body;
    const cond = parseTeacherTextbookConditionInput(condition);
    if (!copyNumber || !cond) {
      return res.status(400).json({ message: 'copyNumber and condition (good|lost|torn) required' });
    }
    const allocRepo = AppDataSource.getRepository(InventoryTeacherTextbookAllocation);
    const alloc = await allocRepo.findOne({
      where: { id: allocationId, teacherUserId: req.user.id }
    });
    if (!alloc) return res.status(404).json({ message: 'Allocation not found or not yours' });
    const nums = alloc.copyNumbers || [];
    if (!nums.includes(String(copyNumber))) {
      return res.status(400).json({ message: 'Copy number is not part of this allocation' });
    }
    const next = { ...(alloc.copyConditions || {}) };
    next[String(copyNumber)] = cond;
    alloc.copyConditions = next;
    await allocRepo.save(alloc);
    const conditionLabel = textbookPhysicalConditionLabel(cond);
    res.json({ message: 'OK', conditionLabel });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---- Teacher: update issued textbook condition (class students only); syncs lost ↔ stock when applicable ---- */
export const patchTeacherTextbookIssuanceCondition = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Teacher only' });
    }
    const { issuanceId } = req.params;
    const cond = parseTeacherTextbookConditionInput(req.body?.condition);
    if (!cond) {
      return res.status(400).json({ message: 'condition must be good, lost, or torn' });
    }
    const issRepo = AppDataSource.getRepository(InventoryTextbookIssuance);
    const iss = await issRepo.findOne({ where: { id: issuanceId }, relations: ['catalog'] });
    if (!iss || !iss.catalog) return res.status(404).json({ message: 'Issuance not found' });

    const scoped = await getTeacherScopedStudentIds(req.user.id);
    if (!scoped.includes(iss.studentId)) {
      return res.status(403).json({ message: 'Not allowed for this student' });
    }

    const wasLost = iss.status === 'lost';
    const activeLike = iss.status === 'active' || iss.status === 'overdue';

    iss.physicalCondition = cond;

    if (cond === 'lost') {
      if (activeLike) {
        iss.status = 'lost';
        iss.lostReportedAt = new Date();
        iss.catalog.quantityTotal = Math.max(0, iss.catalog.quantityTotal - 1);
        await AppDataSource.getRepository(InventoryTextbookCatalog).save(iss.catalog);
      }
    } else {
      if (wasLost) {
        iss.status = 'active';
        iss.lostReportedAt = null;
        iss.catalog.quantityTotal += 1;
        await AppDataSource.getRepository(InventoryTextbookCatalog).save(iss.catalog);
      }
    }

    await issRepo.save(iss);
    const conditionLabel =
      iss.physicalCondition != null
        ? textbookPhysicalConditionLabel(iss.physicalCondition)
        : iss.status === 'lost'
          ? 'Lost'
          : textbookPhysicalConditionLabel(iss.catalog.condition);
    res.json({ message: 'OK', conditionLabel, issuance: iss });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---- Teacher: update furniture item condition (their allocation or class issuance) ---- */
export const patchTeacherFurnitureItemCondition = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Teacher only' });
    }
    const { furnitureItemId } = req.params;
    const cond = parseTeacherFurnitureConditionInput(req.body?.condition);
    if (!cond) {
      return res.status(400).json({ message: 'condition must be good, damaged, or lost' });
    }
    const allowed = await teacherCanUpdateFurnitureItem(req.user.id, furnitureItemId);
    if (!allowed) return res.status(403).json({ message: 'Not allowed for this item' });

    const itemRepo = AppDataSource.getRepository(InventoryFurnitureItem);
    const item = await itemRepo.findOneBy({ id: furnitureItemId });
    if (!item) return res.status(404).json({ message: 'Furniture not found' });
    item.condition = cond;
    await itemRepo.save(item);
    const conditionLabel = furnitureConditionDisplayLabel(cond);
    res.json({ message: 'OK', conditionLabel, item });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---- Teacher: full class issuance report (textbooks + furniture) ---- */
export const getTeacherClassReport = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Teacher only' });
    }

    const teacher = await AppDataSource.getRepository(Teacher).findOneBy({ userId: req.user.id });
    if (!teacher) return res.json({ textbooks: [], furniture: [] });

    const { Class } = await import('../entities/Class');
    const ownedClasses = await AppDataSource.getRepository(Class).find({
      where: [{ classTeacher1Id: teacher.id }, { classTeacher2Id: teacher.id }]
    });

    let classIds = ownedClasses.map(c => c.id);
    if (!classIds.length) {
      const { getTeacherClassIds } = await import('../utils/teacherClassLinker');
      classIds = await getTeacherClassIds(teacher.id);
    }
    if (!classIds.length) return res.json({ textbooks: [], furniture: [], classNames: [] });

    const classNames = ownedClasses.map(c => c.name);

    // Fetch all active students in the teacher's classes
    const students = await AppDataSource.getRepository(Student)
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.classEntity', 'cls')
      .where('s.classId IN (:...classIds)', { classIds })
      .andWhere('s.isActive = true')
      .getMany();

    const studentIds = students.map(s => s.id);
    if (!studentIds.length) return res.json({ textbooks: [], furniture: [], classNames });

    // Textbook issuances for these students
    const textbooks = await AppDataSource.getRepository(InventoryTextbookIssuance)
      .createQueryBuilder('iss')
      .leftJoinAndSelect('iss.catalog', 'catalog')
      .leftJoinAndSelect('iss.student', 'student')
      .leftJoinAndSelect('student.classEntity', 'cls')
      .where('iss.studentId IN (:...studentIds)', { studentIds })
      .orderBy('student.lastName', 'ASC')
      .addOrderBy('catalog.title', 'ASC')
      .getMany();

    const tbAllocRepo = AppDataSource.getRepository(InventoryTeacherTextbookAllocation);
    const tbAllocIds = [...new Set(textbooks.map(t => t.teacherAllocationId).filter(Boolean))] as string[];
    const tbAllocs = tbAllocIds.length
      ? await tbAllocRepo.findBy({ id: In(tbAllocIds) })
      : [];
    const tbAllocMap = new Map(tbAllocs.map(a => [a.id, a]));

    const textbooksOut = textbooks.map(iss => {
      let conditionLabel: 'Good' | 'Lost' | 'Torn';
      if (iss.physicalCondition) {
        conditionLabel = textbookPhysicalConditionLabel(iss.physicalCondition);
      } else if (iss.status === 'lost') {
        conditionLabel = 'Lost';
      } else {
        let raw = iss.catalog?.condition;
        if (iss.teacherAllocationId && iss.copyNumber) {
          const al = tbAllocMap.get(iss.teacherAllocationId);
          const o = al?.copyConditions?.[iss.copyNumber];
          if (o) raw = o;
        }
        conditionLabel = textbookPhysicalConditionLabel(raw);
      }
      return { ...iss, conditionLabel };
    });

    // Furniture issuances for these students
    const furniture = await AppDataSource.getRepository(InventoryFurnitureIssuance)
      .createQueryBuilder('iss')
      .leftJoinAndSelect('iss.furnitureItem', 'item')
      .leftJoinAndSelect('iss.student', 'student')
      .leftJoinAndSelect('student.classEntity', 'cls')
      .where('iss.studentId IN (:...studentIds)', { studentIds })
      .orderBy('student.lastName', 'ASC')
      .addOrderBy('item.itemType', 'ASC')
      .getMany();

    const furnitureOut = furniture.map(iss => ({
      ...iss,
      conditionLabel: furnitureConditionDisplayLabel(iss.furnitureItem?.condition)
    }));

    res.json({ textbooks: textbooksOut, furniture: furnitureOut, classNames });
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};

/* ---- Teacher: get students enrolled in teacher's OWN class(es) only ---- */
export const getTeacherClassStudents = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Teacher only' });
    }

    // Find the teacher record linked to this user
    const teacher = await AppDataSource.getRepository(Teacher).findOneBy({ userId: req.user.id });
    if (!teacher) return res.json([]);

    // For inventory purposes: only fetch students from classes where this teacher
    // is the form/class teacher (classTeacher1 or classTeacher2).
    // This prevents a subject-teacher who teaches in many classes from seeing all students.
    const { Class } = await import('../entities/Class');
    const ownedClasses = await AppDataSource.getRepository(Class).find({
      where: [
        { classTeacher1Id: teacher.id },
        { classTeacher2Id: teacher.id }
      ]
    });

    let classIds = ownedClasses.map(c => c.id);

    // Fallback: if not a class teacher anywhere, fall back to junction table classes
    if (!classIds.length) {
      const { getTeacherClassIds } = await import('../utils/teacherClassLinker');
      classIds = await getTeacherClassIds(teacher.id);
    }

    if (!classIds.length) return res.json([]);

    const students = await AppDataSource.getRepository(Student)
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.classEntity', 'cls')
      .where('s.classId IN (:...classIds)', { classIds })
      .andWhere('s.isActive = true')
      .orderBy('cls.name', 'ASC')
      .addOrderBy('s.lastName', 'ASC')
      .addOrderBy('s.firstName', 'ASC')
      .getMany();

    res.json(students);
  } catch (e: any) {
    res.status(500).json({ message: e.message || 'Error' });
  }
};
