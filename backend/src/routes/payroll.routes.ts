import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  getAncillaryStaff,
  createAncillaryStaff,
  updateAncillaryStaff,
  deleteAncillaryStaff,
  getSalaryStructures,
  createSalaryStructure,
  updateSalaryStructure,
  deleteSalaryStructure,
  getSalaryAssignments,
  assignSalary,
  updateSalaryAssignment,
  removeSalaryAssignment,
  getPayrollRuns,
  createPayrollRun,
  approvePayrollRun,
  getPayrollEntries,
  updatePayrollEntry,
  addLoanDeduction,
  generatePayslipPDF,
  generateBulkPayslips,
  getPayrollReports
} from '../controllers/payroll.controller';

const router = Router();
const payAuth = [authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN)];

// Ancillary Staff
router.get('/ancillary-staff', ...payAuth, getAncillaryStaff);
router.post('/ancillary-staff', ...payAuth, createAncillaryStaff);
router.put('/ancillary-staff/:id', ...payAuth, updateAncillaryStaff);
router.delete('/ancillary-staff/:id', ...payAuth, deleteAncillaryStaff);

// Salary Structures
router.get('/salary-structures', ...payAuth, getSalaryStructures);
router.post('/salary-structures', ...payAuth, createSalaryStructure);
router.put('/salary-structures/:id', ...payAuth, updateSalaryStructure);
router.delete('/salary-structures/:id', ...payAuth, deleteSalaryStructure);

// Salary Assignments
router.get('/salary-assignments', ...payAuth, getSalaryAssignments);
router.post('/salary-assignments', ...payAuth, assignSalary);
router.put('/salary-assignments/:id', ...payAuth, updateSalaryAssignment);
router.delete('/salary-assignments/:id', ...payAuth, removeSalaryAssignment);

// Payroll Runs
router.get('/runs', ...payAuth, getPayrollRuns);
router.post('/runs', ...payAuth, createPayrollRun);
router.put('/runs/:id/approve', ...payAuth, approvePayrollRun);

// Payroll Entries
router.get('/runs/:runId/entries', ...payAuth, getPayrollEntries);
router.put('/entries/:id', ...payAuth, updatePayrollEntry);
router.post('/entries/:id/loan-deduction', ...payAuth, addLoanDeduction);

// Payslip PDF
router.get('/entries/:payrollEntryId/payslip', ...payAuth, generatePayslipPDF);
router.get('/runs/:runId/payslips-bulk', ...payAuth, generateBulkPayslips);

// Reports
router.get('/reports', ...payAuth, getPayrollReports);

export default router;
