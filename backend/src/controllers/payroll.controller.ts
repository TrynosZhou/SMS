import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AncillaryStaff } from '../entities/AncillaryStaff';
import { SalaryStructure, SalaryComponent } from '../entities/SalaryStructure';
import { SalaryAssignment } from '../entities/SalaryAssignment';
import { PayrollRun } from '../entities/PayrollRun';
import { PayrollEntry } from '../entities/PayrollEntry';
import { PayrollEntryLine } from '../entities/PayrollEntryLine';
import { Teacher } from '../entities/Teacher';
import { Settings } from '../entities/Settings';
import archiver from 'archiver';
import { createPayslipPDF } from '../utils/payslipPdfGenerator';
import { generateAncillaryStaffEmployeeId } from '../utils/ancillaryStaffIdGenerator';
import { In, LessThanOrEqual } from 'typeorm';

const parseAmount = (v: any): number => (isFinite(Number(v)) ? Number(v) : 0);

// --- Ancillary Staff ---
export const getAncillaryStaff = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(AncillaryStaff);
    const staff = await repo.find({ order: { employeeId: 'ASC' } });
    res.json(staff);
  } catch (error: any) {
    console.error('getAncillaryStaff:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const createAncillaryStaff = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(AncillaryStaff);
    const {
      employeeId: providedEmployeeId, firstName, lastName, role, designation, department,
      salaryType, bankName, bankAccountNumber, bankBranch, employmentStatus,
      phoneNumber, dateJoined
    } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({ message: 'firstName, lastName are required' });
    }

    let employeeId: string;
    if (providedEmployeeId && String(providedEmployeeId).trim()) {
      employeeId = String(providedEmployeeId).trim();
      const existing = await repo.findOne({ where: { employeeId } });
      if (existing) {
        return res.status(400).json({ message: 'An employee with this employeeId already exists' });
      }
    } else {
      employeeId = await generateAncillaryStaffEmployeeId();
    }

    const staff = repo.create({
      employeeId,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      role: role ? String(role).trim() : null,
      designation: designation ? String(designation).trim() : null,
      department: department ? String(department).trim() : null,
      salaryType: salaryType === 'daily' ? 'daily' : 'monthly',
      bankName: bankName ? String(bankName).trim() : null,
      bankAccountNumber: bankAccountNumber ? String(bankAccountNumber).trim() : null,
      bankBranch: bankBranch ? String(bankBranch).trim() : null,
      employmentStatus: employmentStatus === 'terminated' ? 'terminated' : 'active',
      phoneNumber: phoneNumber ? String(phoneNumber).trim() : null,
      dateJoined: dateJoined ? new Date(dateJoined) : null
    });
    const saved = await repo.save(staff);
    res.status(201).json({ message: 'Ancillary staff created', staff: saved });
  } catch (error: any) {
    console.error('createAncillaryStaff:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const updateAncillaryStaff = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { id } = req.params;
    const repo = AppDataSource.getRepository(AncillaryStaff);
    const staff = await repo.findOne({ where: { id } });
    if (!staff) return res.status(404).json({ message: 'Ancillary staff not found' });

    const fields = ['employeeId', 'firstName', 'lastName', 'role', 'designation', 'department',
      'salaryType', 'bankName', 'bankAccountNumber', 'bankBranch', 'employmentStatus',
      'phoneNumber', 'dateJoined'];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        (staff as any)[f] = f === 'dateJoined' ? (req.body[f] ? new Date(req.body[f]) : null)
          : f === 'salaryType' ? (req.body[f] === 'daily' ? 'daily' : 'monthly')
            : f === 'employmentStatus' ? (req.body[f] === 'terminated' ? 'terminated' : 'active')
              : req.body[f];
      }
    }
    staff.updatedAt = new Date();
    const saved = await repo.save(staff);
    res.json({ message: 'Ancillary staff updated', staff: saved });
  } catch (error: any) {
    console.error('updateAncillaryStaff:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const deleteAncillaryStaff = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { id } = req.params;
    const repo = AppDataSource.getRepository(AncillaryStaff);
    const staff = await repo.findOne({ where: { id } });
    if (!staff) return res.status(404).json({ message: 'Ancillary staff not found' });
    await repo.remove(staff);
    res.json({ message: 'Ancillary staff deleted' });
  } catch (error: any) {
    console.error('deleteAncillaryStaff:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// --- Salary Structures ---
export const getSalaryStructures = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(SalaryStructure);
    const structures = await repo.find({ order: { name: 'ASC' } });
    res.json(structures);
  } catch (error: any) {
    console.error('getSalaryStructures:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const createSalaryStructure = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(SalaryStructure);
    const { name, employeeCategory, components } = req.body;

    if (!name || !employeeCategory) {
      return res.status(400).json({ message: 'name and employeeCategory are required' });
    }
    if (!['teacher', 'ancillary'].includes(employeeCategory)) {
      return res.status(400).json({ message: 'employeeCategory must be teacher or ancillary' });
    }
    const comps: SalaryComponent[] = Array.isArray(components)
      ? components.filter((c: any) => c?.name).map((c: any) => ({
          name: String(c.name),
          type: ['basic', 'allowance', 'deduction'].includes(c.type) ? c.type : 'allowance',
          amount: parseAmount(c.amount)
        }))
      : [];
    const ss = repo.create({ name, employeeCategory, components: comps });
    const saved = await repo.save(ss);
    res.status(201).json({ message: 'Salary structure created', structure: saved });
  } catch (error: any) {
    console.error('createSalaryStructure:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const updateSalaryStructure = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { id } = req.params;
    const repo = AppDataSource.getRepository(SalaryStructure);
    const ss = await repo.findOne({ where: { id } });
    if (!ss) return res.status(404).json({ message: 'Salary structure not found' });

    if (req.body.name !== undefined) ss.name = String(req.body.name);
    if (req.body.employeeCategory !== undefined && ['teacher', 'ancillary'].includes(req.body.employeeCategory)) {
      ss.employeeCategory = req.body.employeeCategory;
    }
    if (Array.isArray(req.body.components)) {
      ss.components = req.body.components.filter((c: any) => c?.name).map((c: any) => ({
        name: String(c.name),
        type: ['basic', 'allowance', 'deduction'].includes(c.type) ? c.type : 'allowance',
        amount: parseAmount(c.amount)
      }));
    }
    ss.updatedAt = new Date();
    const saved = await repo.save(ss);
    res.json({ message: 'Salary structure updated', structure: saved });
  } catch (error: any) {
    console.error('updateSalaryStructure:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const deleteSalaryStructure = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { id } = req.params;
    const repo = AppDataSource.getRepository(SalaryStructure);
    const ss = await repo.findOne({ where: { id } });
    if (!ss) return res.status(404).json({ message: 'Salary structure not found' });
    await repo.remove(ss);
    res.json({ message: 'Salary structure deleted' });
  } catch (error: any) {
    console.error('deleteSalaryStructure:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// --- Salary Assignments ---
export const getSalaryAssignments = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(SalaryAssignment);
    const assignments = await repo.find({
      relations: ['teacher', 'ancillaryStaff', 'salaryStructure'],
      order: { effectiveFrom: 'DESC' }
    });
    res.json(assignments);
  } catch (error: any) {
    console.error('getSalaryAssignments:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const assignSalary = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { teacherId, ancillaryStaffId, salaryStructureId, effectiveFrom } = req.body;
    if ((!teacherId && !ancillaryStaffId) || !salaryStructureId || !effectiveFrom) {
      return res.status(400).json({ message: 'Provide (teacherId XOR ancillaryStaffId), salaryStructureId, effectiveFrom' });
    }
    if (teacherId && ancillaryStaffId) {
      return res.status(400).json({ message: 'Provide either teacherId or ancillaryStaffId, not both' });
    }

    const structRepo = AppDataSource.getRepository(SalaryStructure);
    const struct = await structRepo.findOne({ where: { id: salaryStructureId } });
    if (!struct) return res.status(404).json({ message: 'Salary structure not found' });

    if (teacherId) {
      if (struct.employeeCategory !== 'teacher') {
        return res.status(400).json({ message: 'Salary structure is for ancillary, not teacher' });
      }
      const teacherRepo = AppDataSource.getRepository(Teacher);
      const teacher = await teacherRepo.findOne({ where: { id: teacherId } });
      if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
    }
    if (ancillaryStaffId) {
      if (struct.employeeCategory !== 'ancillary') {
        return res.status(400).json({ message: 'Salary structure is for teacher, not ancillary' });
      }
      const ancRepo = AppDataSource.getRepository(AncillaryStaff);
      const anc = await ancRepo.findOne({ where: { id: ancillaryStaffId } });
      if (!anc) return res.status(404).json({ message: 'Ancillary staff not found' });
    }

    const saRepo = AppDataSource.getRepository(SalaryAssignment);
    const sa = saRepo.create({
      teacherId: teacherId || null,
      ancillaryStaffId: ancillaryStaffId || null,
      salaryStructureId,
      effectiveFrom: new Date(effectiveFrom)
    });
    const saved = await saRepo.save(sa);
    res.status(201).json({ message: 'Salary assigned', assignment: saved });
  } catch (error: any) {
    console.error('assignSalary:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const removeSalaryAssignment = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { id } = req.params;
    const repo = AppDataSource.getRepository(SalaryAssignment);
    const sa = await repo.findOne({ where: { id } });
    if (!sa) return res.status(404).json({ message: 'Salary assignment not found' });
    await repo.remove(sa);
    res.json({ message: 'Salary assignment removed' });
  } catch (error: any) {
    console.error('removeSalaryAssignment:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// --- Payroll Runs ---
function getEffectiveAssignment(
  assignments: SalaryAssignment[],
  effectiveDate: Date,
  teacherId: string | null,
  ancillaryStaffId: string | null
): SalaryAssignment | null {
  const filtered = assignments.filter(a => {
    const dt = new Date(a.effectiveFrom);
    if (dt.getTime() > effectiveDate.getTime()) return false;
    if (teacherId) return a.teacherId === teacherId;
    if (ancillaryStaffId) return a.ancillaryStaffId === ancillaryStaffId;
    return false;
  });
  if (filtered.length === 0) return null;
  filtered.sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
  return filtered[0];
}

export const getPayrollRuns = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const runRepo = AppDataSource.getRepository(PayrollRun);
    const entryRepo = AppDataSource.getRepository(PayrollEntry);
    const runs = await runRepo.find({ order: { year: 'DESC', month: 'DESC' } });
    for (const run of runs) {
      const tg = parseAmount(run.totalGross);
      const tn = parseAmount(run.totalNet);
      if ((tg === 0 || tn === 0)) {
        const entries = await entryRepo.find({ where: { payrollRunId: run.id } });
        if (entries.length > 0) {
          const recalcGross = entries.reduce((s, e) => s + parseAmount(e.grossSalary), 0);
          const recalcNet = entries.reduce((s, e) => s + parseAmount(e.netSalary), 0);
          run.totalGross = recalcGross;
          run.totalNet = recalcNet;
          await runRepo.update(run.id, { totalGross: recalcGross, totalNet: recalcNet });
        }
      }
    }
    res.json(runs);
  } catch (error: any) {
    console.error('getPayrollRuns:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const createPayrollRun = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { month, year } = req.body;
    const m = parseInt(String(month));
    const y = parseInt(String(year));
    if (isNaN(m) || m < 1 || m > 12 || isNaN(y)) {
      return res.status(400).json({ message: 'Valid month (1-12) and year required' });
    }

    const runRepo = AppDataSource.getRepository(PayrollRun);
    const existing = await runRepo.findOne({ where: { month: m, year: y } });
    if (existing) {
      return res.status(400).json({ message: `Payroll run for ${m}/${y} already exists` });
    }

    const teacherRepo = AppDataSource.getRepository(Teacher);
    const ancRepo = AppDataSource.getRepository(AncillaryStaff);
    const saRepo = AppDataSource.getRepository(SalaryAssignment);
    const structRepo = AppDataSource.getRepository(SalaryStructure);
    const entryRepo = AppDataSource.getRepository(PayrollEntry);
    const lineRepo = AppDataSource.getRepository(PayrollEntryLine);

    const effectiveDate = new Date(y, m - 1, 1);
    const lastDayOfMonth = new Date(y, m, 0);

    const teachers = await teacherRepo.find({ where: { isActive: true } });
    const ancillary = await ancRepo.find({ where: { employmentStatus: 'active' } });
    const assignments = await saRepo.find({
      relations: ['salaryStructure'],
      where: { effectiveFrom: LessThanOrEqual(lastDayOfMonth) }
    });
    const structures: Record<string, SalaryStructure> = {};
    for (const sa of assignments) {
      if (sa.salaryStructureId && !structures[sa.salaryStructureId]) {
        const s = await structRepo.findOne({ where: { id: sa.salaryStructureId } });
        if (s) structures[sa.salaryStructureId] = s;
      }
    }

    const run = runRepo.create({ month: m, year: y, status: 'draft', totalGross: 0, totalNet: 0 });
    const savedRun = await runRepo.save(run);

    let totalGross = 0, totalNet = 0;
    const entries: PayrollEntry[] = [];

    for (const t of teachers) {
      const sa = getEffectiveAssignment(assignments, lastDayOfMonth, t.id, null);
      if (!sa) continue;
      const struct = structures[sa.salaryStructureId];
      if (!struct || !struct.components?.length) continue;

      let gross = 0, allowances = 0, deductions = 0;
      const lineData: { name: string; type: 'basic' | 'allowance' | 'deduction'; amount: number }[] = [];
      for (const comp of struct.components) {
        const amt = parseAmount(comp.amount);
        lineData.push({ name: comp.name, type: comp.type, amount: amt });
        if (comp.type === 'basic' || comp.type === 'allowance') {
          gross += amt;
          if (comp.type === 'allowance') allowances += amt;
        } else if (comp.type === 'deduction') {
          deductions += amt;
        }
      }
      const net = gross - deductions;
      const entry = entryRepo.create({
        payrollRunId: savedRun.id,
        teacherId: t.id,
        ancillaryStaffId: null,
        grossSalary: gross,
        totalAllowances: allowances,
        totalDeductions: deductions,
        netSalary: net
      });
      const savedEntry = await entryRepo.save(entry);
      for (const ld of lineData) {
        const line = lineRepo.create({
          payrollEntryId: savedEntry.id,
          componentName: ld.name,
          componentType: ld.type,
          amount: ld.amount
        });
        await lineRepo.save(line);
      }
      totalGross += gross;
      totalNet += net;
      entries.push(savedEntry);
    }

    for (const a of ancillary) {
      const sa = getEffectiveAssignment(assignments, lastDayOfMonth, null, a.id);
      if (!sa) continue;
      const struct = structures[sa.salaryStructureId];
      if (!struct || !struct.components?.length) continue;

      let gross = 0, allowances = 0, deductions = 0;
      const ancLineData: { name: string; type: 'basic' | 'allowance' | 'deduction'; amount: number }[] = [];
      for (const comp of struct.components) {
        const amt = parseAmount(comp.amount);
        ancLineData.push({ name: comp.name, type: comp.type, amount: amt });
        if (comp.type === 'basic' || comp.type === 'allowance') {
          gross += amt;
          if (comp.type === 'allowance') allowances += amt;
        } else if (comp.type === 'deduction') {
          deductions += amt;
        }
      }
      const net = gross - deductions;
      const entry = entryRepo.create({
        payrollRunId: savedRun.id,
        teacherId: null,
        ancillaryStaffId: a.id,
        grossSalary: gross,
        totalAllowances: allowances,
        totalDeductions: deductions,
        netSalary: net
      });
      const savedEntry = await entryRepo.save(entry);
      for (const ld of ancLineData) {
        const line = lineRepo.create({
          payrollEntryId: savedEntry.id,
          componentName: ld.name,
          componentType: ld.type,
          amount: ld.amount
        });
        await lineRepo.save(line);
      }
      totalGross += gross;
      totalNet += net;
      entries.push(savedEntry);
    }

    savedRun.totalGross = totalGross;
    savedRun.totalNet = totalNet;
    await runRepo.save(savedRun);

    res.status(201).json({
      message: 'Payroll run created',
      payrollRun: savedRun,
      entryCount: entries.length
    });
  } catch (error: any) {
    console.error('createPayrollRun:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const approvePayrollRun = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { id } = req.params;
    const repo = AppDataSource.getRepository(PayrollRun);
    const run = await repo.findOne({ where: { id } });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (run.status === 'approved') {
      return res.status(400).json({ message: 'Payroll run already approved' });
    }
    run.status = 'approved';
    await repo.save(run);
    res.json({ message: 'Payroll run approved', payrollRun: run });
  } catch (error: any) {
    console.error('approvePayrollRun:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// --- Payroll Entries ---
export const getPayrollEntries = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { runId } = req.params;
    const repo = AppDataSource.getRepository(PayrollEntry);
    const entries = await repo.find({
      where: { payrollRunId: runId },
      relations: ['teacher', 'ancillaryStaff', 'lines']
    });
    res.json(entries);
  } catch (error: any) {
    console.error('getPayrollEntries:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const updatePayrollEntry = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { id } = req.params;
    const { grossSalary, totalAllowances, totalDeductions, netSalary } = req.body;

    const entryRepo = AppDataSource.getRepository(PayrollEntry);
    const runRepo = AppDataSource.getRepository(PayrollRun);
    const lineRepo = AppDataSource.getRepository(PayrollEntryLine);

    const entry = await entryRepo.findOne({
      where: { id },
      relations: ['payrollRun', 'lines']
    });
    if (!entry) return res.status(404).json({ message: 'Payroll entry not found' });
    if (entry.payrollRun?.status === 'approved') {
      return res.status(400).json({ message: 'Cannot modify entry of approved payroll run' });
    }

    let gross = entry.grossSalary, allowances = entry.totalAllowances, deductions = entry.totalDeductions, net = entry.netSalary;
    if (grossSalary !== undefined) gross = parseAmount(grossSalary);
    if (totalAllowances !== undefined) allowances = parseAmount(totalAllowances);
    if (totalDeductions !== undefined) deductions = parseAmount(totalDeductions);
    if (netSalary !== undefined) net = parseAmount(netSalary);

    entry.grossSalary = gross;
    entry.totalAllowances = allowances;
    entry.totalDeductions = deductions;
    entry.netSalary = net;
    await entryRepo.save(entry);

    const run = await runRepo.findOne({ where: { id: entry.payrollRunId } });
    if (run) {
      const allEntries = await entryRepo.find({ where: { payrollRunId: run.id } });
      run.totalGross = allEntries.reduce((s, e) => s + parseAmount(e.grossSalary), 0);
      run.totalNet = allEntries.reduce((s, e) => s + parseAmount(e.netSalary), 0);
      await runRepo.save(run);
    }

    res.json({ message: 'Payroll entry updated', entry });
  } catch (error: any) {
    console.error('updatePayrollEntry:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// --- Payslip PDF ---
export const generatePayslipPDF = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { payrollEntryId } = req.params;

    const entryRepo = AppDataSource.getRepository(PayrollEntry);
    const settingsRepo = AppDataSource.getRepository(Settings);

    const entry = await entryRepo.findOne({
      where: { id: payrollEntryId },
      relations: ['teacher', 'ancillaryStaff', 'lines', 'payrollRun']
    });
    if (!entry) return res.status(404).json({ message: 'Payroll entry not found' });

    const settingsList = await settingsRepo.find({ order: { createdAt: 'DESC' }, take: 1 });
    const settings = settingsList[0] || null;
    const run = entry.payrollRun as PayrollRun;
    const month = run?.month ?? new Date().getMonth() + 1;
    const year = run?.year ?? new Date().getFullYear();

    const buffer = await createPayslipPDF({
      payrollEntry: entry,
      teacher: entry.teacher || undefined,
      ancillaryStaff: entry.ancillaryStaff || undefined,
      settings,
      month,
      year
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="payslip-${payrollEntryId}.pdf"`);
    res.send(buffer);
  } catch (error: any) {
    console.error('generatePayslipPDF:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const generateBulkPayslips = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { runId } = req.params;

    const entryRepo = AppDataSource.getRepository(PayrollEntry);
    const runRepo = AppDataSource.getRepository(PayrollRun);
    const settingsRepo = AppDataSource.getRepository(Settings);

    const run = await runRepo.findOne({ where: { id: runId } });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });

    const entries = await entryRepo.find({
      where: { payrollRunId: runId },
      relations: ['teacher', 'ancillaryStaff', 'lines', 'payrollRun']
    });
    if (entries.length === 0) {
      return res.status(400).json({ message: 'No payroll entries for this run' });
    }

    const settingsList = await settingsRepo.find({ order: { createdAt: 'DESC' }, take: 1 });
    const settings = settingsList[0] || null;
    const month = run.month ?? new Date().getMonth() + 1;
    const year = run.year ?? new Date().getFullYear();

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="payslips-${year}-${String(month).padStart(2, '0')}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    const getFileName = (entry: PayrollEntry): string => {
      const teacher = entry.teacher as any;
      const ancillary = entry.ancillaryStaff as any;
      const last = teacher ? (teacher.lastName || '') : ancillary ? (ancillary.lastName || '') : '';
      const first = teacher ? (teacher.firstName || '') : ancillary ? (ancillary.firstName || '') : '';
      const name = [last.trim(), first.trim()].filter(Boolean).join('_') || 'payslip';
      const safe = name.replace(/[^a-zA-Z0-9-_]/g, '_');
      return `${safe}.pdf`;
    };

    for (const entry of entries) {
      const buffer = await createPayslipPDF({
        payrollEntry: entry,
        teacher: entry.teacher || undefined,
        ancillaryStaff: entry.ancillaryStaff || undefined,
        settings,
        month,
        year
      });
      archive.append(buffer, { name: getFileName(entry) });
    }

    await archive.finalize();
  } catch (error: any) {
    console.error('generateBulkPayslips:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
};

// --- Reports ---
export const getPayrollReports = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    const { type, month, year } = req.query;

    const runRepo = AppDataSource.getRepository(PayrollRun);
    const entryRepo = AppDataSource.getRepository(PayrollEntry);
    const lineRepo = AppDataSource.getRepository(PayrollEntryLine);

    const m = month ? parseInt(String(month)) : new Date().getMonth() + 1;
    const y = year ? parseInt(String(year)) : new Date().getFullYear();

    const runs = await runRepo.find({ where: { month: m, year: y } });
    const runIds = runs.map(r => r.id);

    if (type === 'monthly_summary') {
      let totalGross = 0, totalNet = 0, totalAllowances = 0, totalDeductions = 0;
      const entries = runIds.length
        ? await entryRepo.find({ where: { payrollRunId: In(runIds) } })
        : [];
      for (const e of entries) {
        totalGross += parseAmount(e.grossSalary);
        totalNet += parseAmount(e.netSalary);
        totalAllowances += parseAmount(e.totalAllowances);
        totalDeductions += parseAmount(e.totalDeductions);
      }
      return res.json({
        type: 'monthly_summary',
        month: m,
        year: y,
        totalGross,
        totalNet,
        totalAllowances,
        totalDeductions,
        employeeCount: entries.length
      });
    }

    if (type === 'deduction_summary') {
      const entries = runIds.length
        ? await entryRepo.find({ where: { payrollRunId: In(runIds) } })
        : [];
      const entryIds = entries.map(e => e.id);
      const lines = entryIds.length
        ? await lineRepo
            .createQueryBuilder('l')
            .where('l.payrollEntryId IN (:...ids)', { ids: entryIds })
            .andWhere('l.componentType = :type', { type: 'deduction' })
            .getMany()
        : [];
      const byComponent: Record<string, number> = {};
      for (const l of lines) {
        byComponent[l.componentName] = (byComponent[l.componentName] || 0) + parseAmount(l.amount);
      }
      return res.json({
        type: 'deduction_summary',
        month: m,
        year: y,
        byComponent,
        totalDeductions: Object.values(byComponent).reduce((a, b) => a + b, 0)
      });
    }

    if (type === 'department_summary') {
      const entries = runIds.length
        ? await entryRepo.find({
            where: { payrollRunId: In(runIds) },
            relations: ['teacher', 'ancillaryStaff']
          })
        : [];
      const byDept: Record<string, { count: number; gross: number; net: number }> = {};
      for (const e of entries) {
        const dept = (e.ancillaryStaff?.department || e.teacher ? 'Teaching' : 'Other').trim() || 'Other';
        if (!byDept[dept]) byDept[dept] = { count: 0, gross: 0, net: 0 };
        byDept[dept].count++;
        byDept[dept].gross += parseAmount(e.grossSalary);
        byDept[dept].net += parseAmount(e.netSalary);
      }
      return res.json({
        type: 'department_summary',
        month: m,
        year: y,
        byDepartment: byDept
      });
    }

    res.status(400).json({ message: 'Invalid report type. Use: monthly_summary, deduction_summary, department_summary' });
  } catch (error: any) {
    console.error('getPayrollReports:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
