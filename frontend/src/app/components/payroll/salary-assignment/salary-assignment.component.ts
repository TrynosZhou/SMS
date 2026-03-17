import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PayrollService } from '../../../services/payroll.service';
import { TeacherService } from '../../../services/teacher.service';

@Component({
  selector: 'app-salary-assignment',
  templateUrl: './salary-assignment.component.html',
  styleUrls: ['./salary-assignment.component.css']
})
export class SalaryAssignmentComponent implements OnInit {
  staff: any[] = [];
  teachers: any[] = [];
  structures: any[] = [];
  assignments: any[] = [];
  /** Loan accounts with balance > 0 (from backend). */
  loanAccounts: any[] = [];
  loading = false;
  error = '';
  success = '';
  employeeType: 'teacher' | 'ancillary' = 'ancillary';
  selectedEmployeeId = '';
  selectedStructureId = '';
  effectiveFrom = '';
  /** Editable copy of structure components for the assign form (negotiated amounts). */
  assignComponents: { name: string; type: string; amount: number }[] = [];
  submitting = false;
  filterType: 'all' | 'teacher' | 'ancillary' = 'all';
  searchQuery = '';
  /** Edit assignment modal */
  editingAssignment: any = null;
  editForm: { effectiveFrom: string; components: { name: string; type: string; amount: number }[] } = { effectiveFrom: '', components: [] };
  savingEdit = false;

  get teacherAssignments(): any[] {
    return (this.assignments || []).filter((a: any) => a.teacherId);
  }
  get ancillaryAssignments(): any[] {
    return (this.assignments || []).filter((a: any) => a.ancillaryStaffId);
  }
  get filteredAssignments(): any[] {
    let list = this.assignments || [];
    if (this.filterType === 'teacher') list = list.filter((a: any) => a.teacherId);
    if (this.filterType === 'ancillary') list = list.filter((a: any) => a.ancillaryStaffId);
    const q = (this.searchQuery || '').toLowerCase().trim();
    if (q) {
      list = list.filter((a: any) => {
        const emp = a.teacher || a.ancillaryStaff;
        const name = emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.toLowerCase() : '';
        const struct = (a.salaryStructure?.name || '').toLowerCase();
        return name.includes(q) || struct.includes(q);
      });
    }
    return list;
  }

  constructor(
    private payrollService: PayrollService,
    private teacherService: TeacherService,
    private router: Router
  ) {}

  ngOnInit() {
    this.effectiveFrom = new Date().toISOString().slice(0, 10);
    this.loadData();
  }

  loadData() {
    this.loading = true;
    this.error = '';
    this.payrollService.getAncillaryStaff().subscribe({
      next: (data) => { this.staff = (data || []).filter((s: any) => s.employmentStatus === 'active'); },
      error: () => {}
    });
    this.teacherService.getTeachersPaginated(1, 500).subscribe({
      next: (res: any) => {
        const arr = Array.isArray(res) ? res : (res?.data || []);
        this.teachers = arr;
      },
      error: () => {}
    });
    this.payrollService.getSalaryStructures().subscribe({
      next: (data) => {
        this.structures = data || [];
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load';
        this.loading = false;
      }
    });
    this.payrollService.getSalaryAssignments().subscribe({
      next: (data) => { this.assignments = data || []; },
      error: () => {}
    });
    this.payrollService.getLoanBalances().subscribe({
      next: (data) => { this.loanAccounts = data || []; },
      error: () => {}
    });
  }

  onEmployeeTypeChange() {
    this.selectedEmployeeId = '';
    this.selectedStructureId = '';
    this.assignComponents = [];
  }

  onStructureChange() {
    const struct = (this.structures || []).find((s: any) => s.id === this.selectedStructureId);
    if (struct && Array.isArray(struct.components) && struct.components.length > 0) {
      this.assignComponents = struct.components.map((c: any) => ({
        name: c.name || '',
        type: c.type || 'allowance',
        amount: typeof c.amount === 'number' ? c.amount : Number(c.amount) || 0
      }));
    } else {
      this.assignComponents = [];
    }
  }

  getFilteredStructures() {
    const cat = this.employeeType === 'teacher' ? 'teacher' : 'ancillary';
    return (this.structures || []).filter((s: any) => s.employeeCategory === cat);
  }

  getAssignmentEmployeeName(a: any): string {
    if (a.teacher) return `${a.teacher.firstName || ''} ${a.teacher.lastName || ''}`.trim();
    if (a.ancillaryStaff) return `${a.ancillaryStaff.firstName || ''} ${a.ancillaryStaff.lastName || ''}`.trim();
    return '—';
  }

  getEmployeeLabel(emp: any) {
    if (!emp) return '';
    return `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.employeeId || emp.teacherId || emp.id;
  }

  assign() {
    if (!this.selectedEmployeeId || !this.selectedStructureId || !this.effectiveFrom) {
      this.error = 'Select employee, structure, and effective date';
      return;
    }
    const filtered = this.getFilteredStructures();
    if (!filtered.find((s: any) => s.id === this.selectedStructureId)) {
      this.error = 'Structure does not match employee type';
      return;
    }
    this.submitting = true;
    this.error = '';
    const payload: any = { salaryStructureId: this.selectedStructureId, effectiveFrom: this.effectiveFrom };
    if (this.employeeType === 'teacher') {
      payload.teacherId = this.selectedEmployeeId;
    } else {
      payload.ancillaryStaffId = this.selectedEmployeeId;
    }
    if (this.assignComponents.length > 0) {
      payload.customComponents = this.assignComponents.map(c => ({ name: c.name, type: c.type, amount: c.amount }));
    }
    this.payrollService.assignSalary(payload).subscribe({
      next: () => {
        this.success = 'Salary assigned';
        this.selectedEmployeeId = '';
        this.selectedStructureId = '';
        this.assignComponents = [];
        this.loadData();
        setTimeout(() => this.success = '', 3000);
        this.submitting = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Assignment failed';
        this.submitting = false;
      }
    });
  }

  remove(id: string) {
    if (!confirm('Remove this salary assignment?')) return;
    this.payrollService.removeSalaryAssignment(id).subscribe({
      next: () => { this.success = 'Removed'; this.loadData(); setTimeout(() => this.success = '', 3000); },
      error: (err) => { this.error = err?.error?.message || 'Remove failed'; }
    });
  }

  getEmployees() {
    return this.employeeType === 'teacher' ? this.teachers : this.staff;
  }

  openEdit(a: any) {
    this.editingAssignment = a;
    const struct = a.salaryStructure;
    const comps = Array.isArray(a.customComponents) && a.customComponents.length > 0
      ? a.customComponents.map((c: any) => ({ name: c.name || '', type: c.type || 'allowance', amount: Number(c.amount) || 0 }))
      : (struct?.components || []).map((c: any) => ({ name: c.name || '', type: c.type || 'allowance', amount: Number(c.amount) || 0 }));
    this.editForm = {
      effectiveFrom: a.effectiveFrom ? new Date(a.effectiveFrom).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      components: comps
    };
  }

  closeEdit() {
    this.editingAssignment = null;
  }

  saveEdit() {
    if (!this.editingAssignment) return;
    this.savingEdit = true;
    this.error = '';
    const payload: any = {
      effectiveFrom: this.editForm.effectiveFrom,
      customComponents: this.editForm.components.map(c => ({ name: c.name, type: c.type, amount: c.amount }))
    };
    this.payrollService.updateSalaryAssignment(this.editingAssignment.id, payload).subscribe({
      next: () => {
        this.success = 'Assignment updated';
        this.closeEdit();
        this.loadData();
        this.savingEdit = false;
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = err?.error?.message || 'Update failed';
        this.savingEdit = false;
      }
    });
  }

  hasCustomAmounts(a: any): boolean {
    return Array.isArray(a.customComponents) && a.customComponents.length > 0;
  }

  /** Loan balance for the currently selected employee in assign form. */
  getSelectedEmployeeLoanBalance(): number {
    if (!this.selectedEmployeeId) return 0;
    const acc = this.loanAccounts.find((la: any) =>
      (la.teacherId && la.teacherId === this.selectedEmployeeId) ||
      (la.ancillaryStaffId && la.ancillaryStaffId === this.selectedEmployeeId)
    );
    return acc ? Number(acc.balance) || 0 : 0;
  }

  getLoanAccountEmployeeName(account: any): string {
    if (account?.teacher) return `${account.teacher.firstName || ''} ${account.teacher.lastName || ''}`.trim();
    if (account?.ancillaryStaff) return `${account.ancillaryStaff.firstName || ''} ${account.ancillaryStaff.lastName || ''}`.trim();
    return '—';
  }
}
