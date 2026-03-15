import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { PayrollService } from '../../../services/payroll.service';
import { TeacherService } from '../../../services/teacher.service';

@Component({
  selector: 'app-ancillary-staff-list',
  templateUrl: './ancillary-staff-list.component.html',
  styleUrls: ['./ancillary-staff-list.component.css']
})
export class AncillaryStaffListComponent implements OnInit {
  activeTab: 'teachers' | 'ancillary' = 'teachers';
  teachers: any[] = [];
  staff: any[] = [];
  salaryAssignments: any[] = [];
  loading = false;
  error = '';
  success = '';
  searchQuery = '';
  teacherFilter: 'all' | 'assigned' | 'unassigned' = 'all';

  /** Inline edit modal */
  modalOpen = false;
  editContext: {
    type: 'teacher' | 'ancillary';
    id: string;
    field: string;
    label: string;
    row: any;
  } | null = null;
  editValue = '';
  editFirstName = '';
  editLastName = '';
  saving = false;

  get filteredTeachers(): any[] {
    let list = this.teachers;
    if (this.teacherFilter === 'assigned') list = list.filter((t: any) => this.hasSalaryAssigned(t.id));
    if (this.teacherFilter === 'unassigned') list = list.filter((t: any) => !this.hasSalaryAssigned(t.id));
    const q = (this.searchQuery || '').toLowerCase().trim();
    if (q) {
      list = list.filter((t: any) => {
        const name = `${t.firstName || ''} ${t.lastName || ''}`.toLowerCase();
        const id = (t.employeeId || t.teacherId || '').toLowerCase();
        const email = (t.email || '').toLowerCase();
        return name.includes(q) || id.includes(q) || email.includes(q);
      });
    }
    return list;
  }

  get filteredStaff(): any[] {
    const q = (this.searchQuery || '').toLowerCase().trim();
    if (!q) return this.staff;
    return this.staff.filter((s: any) => {
      const name = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
      const id = (s.employeeId || '').toLowerCase();
      const role = (s.role || '').toLowerCase();
      const dept = (s.department || '').toLowerCase();
      return name.includes(q) || id.includes(q) || role.includes(q) || dept.includes(q);
    });
  }

  get teachersWithSalary(): number {
    return this.teachers.filter((t: any) => this.hasSalaryAssigned(t.id)).length;
  }

  constructor(
    private payrollService: PayrollService,
    private teacherService: TeacherService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.loading = true;
    this.error = '';
    forkJoin({
      teachers: this.teacherService.getTeachersPaginated(1, 5000).pipe(map((r: any) => Array.isArray(r) ? r : (r?.data || []))),
      staff: this.payrollService.getAncillaryStaff(),
      assignments: this.payrollService.getSalaryAssignments()
    }).subscribe({
      next: ({ teachers, staff, assignments }) => {
        this.teachers = (teachers || []).filter((t: any) => t.isActive !== false);
        this.staff = (staff || []).filter((s: any) => s.employmentStatus === 'active');
        this.salaryAssignments = assignments || [];
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load';
        this.loading = false;
      }
    });
  }

  hasSalaryAssigned(teacherId: string): boolean {
    return this.salaryAssignments.some((a: any) => a.teacherId === teacherId);
  }

  assignSalary() {
    this.router.navigate(['/payroll/assignments']);
  }

  addNew() {
    this.router.navigate(['/payroll/employees/new']);
  }

  edit(id: string) {
    this.router.navigate(['/payroll/employees', id, 'edit']);
  }

  delete(id: string, name: string) {
    if (!confirm(`Delete ${name}?`)) return;
    this.payrollService.deleteAncillaryStaff(id).subscribe({
      next: () => {
        this.success = 'Staff deleted';
        this.loadAll();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = err?.error?.message || 'Delete failed';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  openEdit(type: 'teacher' | 'ancillary', row: any, field: string, label: string): void {
    this.editContext = { type, id: row.id, field, label, row };
    if (field === 'name') {
      this.editFirstName = row.firstName || '';
      this.editLastName = row.lastName || '';
    } else {
      let raw = row[field];
      if (field === 'phoneNumber') raw = row.phoneNumber ?? row.phone;
      if (field === 'email' && type === 'teacher' && row.user) raw = row.user.email ?? row.email;
      this.editValue = raw != null ? String(raw) : '';
    }
    this.modalOpen = true;
    this.error = '';
  }

  closeEdit(): void {
    this.modalOpen = false;
    this.editContext = null;
    this.editValue = '';
    this.editFirstName = '';
    this.editLastName = '';
  }

  saveEdit(): void {
    if (!this.editContext) return;
    const { type, id, field } = this.editContext;
    let payload: any;
    if (field === 'name') {
      payload = { firstName: (this.editFirstName || '').trim(), lastName: (this.editLastName || '').trim() };
      if (!payload.firstName || !payload.lastName) {
        this.error = 'First name and last name are required';
        return;
      }
    } else {
      payload = { [field]: this.editValue };
    }
    this.saving = true;
    this.error = '';
    const req = type === 'ancillary'
      ? this.payrollService.updateAncillaryStaff(id, payload)
      : this.teacherService.updateTeacher(id, payload);
    req.subscribe({
      next: () => {
        this.saving = false;
        this.success = 'Updated';
        this.loadAll();
        this.closeEdit();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.saving = false;
        this.error = err?.error?.message || 'Update failed';
      }
    });
  }
}
