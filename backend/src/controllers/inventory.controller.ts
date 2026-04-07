import { Response } from 'express';
import { FindOptionsWhere, In } from 'typeorm';
import { AuthRequest } from '../middleware/auth';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/User';
import { Settings } from '../entities/Settings';
import { Student } from '../entities/Student';
import { InventoryTextbookCatalog } from '../entities/InventoryTextbookCatalog';
import { InventoryFurnitureItem } from '../entities/InventoryFurnitureItem';
import { InventoryTextbookIssuance } from '../entities/InventoryTextbookIssuance';
import { InventoryFurnitureIssuance } from '../entities/InventoryFurnitureIssuance';
import { InventoryFine } from '../entities/InventoryFine';
import { InventoryAuditLog } from '../entities/InventoryAuditLog';
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
