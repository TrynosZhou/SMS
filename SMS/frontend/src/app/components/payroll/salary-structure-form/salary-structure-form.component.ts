import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PayrollService } from '../../../services/payroll.service';

@Component({
  selector: 'app-salary-structure-form',
  templateUrl: './salary-structure-form.component.html',
  styleUrls: ['./salary-structure-form.component.css']
})
export class SalaryStructureFormComponent implements OnInit {
  id: string | null = null;
  isEdit = false;
  name = '';
  category = 'teacher';
  components: { name: string; type: string; amount: number }[] = [];
  loading = false;
  submitting = false;
  error = '';
  success = '';

  constructor(
    private payrollService: PayrollService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!this.id;
    if (this.isEdit && this.id) {
      this.loadStructure();
    } else {
      this.addComponent();
    }
  }

  loadStructure() {
    if (!this.id) return;
    this.loading = true;
    this.payrollService.getSalaryStructures().subscribe({
      next: (list: any[]) => {
        const s = (list || []).find((x: any) => x.id === this.id);
        if (s) {
          this.name = s.name || '';
          this.category = s.employeeCategory || 'teacher';
          this.components = Array.isArray(s.components) && s.components.length > 0
            ? s.components.map((c: any) => ({ name: c.name || '', type: c.type || 'allowance', amount: parseFloat(String(c.amount)) || 0 }))
            : [{ name: '', type: 'basic', amount: 0 }];
        }
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load';
        this.loading = false;
      }
    });
  }

  addComponent() {
    this.components.push({ name: '', type: 'allowance', amount: 0 });
  }

  removeComponent(i: number) {
    this.components.splice(i, 1);
  }

  get totalBasic(): number {
    return this.components.filter(c => c.type === 'basic').reduce((s, c) => s + (Number(c.amount) || 0), 0);
  }
  get totalAllowances(): number {
    return this.components.filter(c => c.type === 'allowance').reduce((s, c) => s + (Number(c.amount) || 0), 0);
  }
  get totalDeductions(): number {
    return this.components.filter(c => c.type === 'deduction').reduce((s, c) => s + (Number(c.amount) || 0), 0);
  }
  get grossSalary(): number {
    return this.totalBasic + this.totalAllowances;
  }
  get netSalary(): number {
    return this.grossSalary - this.totalDeductions;
  }

  submit() {
    if (!this.name?.trim()) {
      this.error = 'Name is required';
      return;
    }
    const valid = this.components.filter(c => c.name?.trim());
    if (valid.length === 0) {
      this.error = 'Add at least one component with a name';
      return;
    }
    this.submitting = true;
    this.error = '';
    const payload = {
      name: this.name.trim(),
      employeeCategory: this.category,
      components: valid.map(c => ({ name: c.name.trim(), type: c.type, amount: Number(c.amount) || 0 }))
    };
    if (this.isEdit && this.id) {
      this.payrollService.updateSalaryStructure(this.id, payload).subscribe({
        next: () => {
          this.success = 'Updated';
          setTimeout(() => this.router.navigate(['/payroll/salary-structures']), 1500);
        },
        error: (err) => {
          this.error = err?.error?.message || 'Update failed';
          this.submitting = false;
        }
      });
    } else {
      this.payrollService.createSalaryStructure(payload).subscribe({
        next: () => {
          this.success = 'Created';
          setTimeout(() => this.router.navigate(['/payroll/salary-structures']), 1500);
        },
        error: (err) => {
          this.error = err?.error?.message || 'Create failed';
          this.submitting = false;
        }
      });
    }
  }

  cancel() {
    this.router.navigate(['/payroll/salary-structures']);
  }
}
