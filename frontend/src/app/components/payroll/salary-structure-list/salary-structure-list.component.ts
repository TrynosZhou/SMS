import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { PayrollService } from '../../../services/payroll.service';

@Component({
  standalone: false,  selector: 'app-salary-structure-list',
  templateUrl: './salary-structure-list.component.html',
  styleUrls: ['./salary-structure-list.component.css']
})
export class SalaryStructureListComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
structures: any[] = [];
  loading = false;
  error = '';
  success = '';
  searchQuery = '';
  categoryFilter: 'all' | 'teacher' | 'ancillary' = 'all';

  get teacherStructures(): any[] {
    return (this.structures || []).filter((s: any) => s.employeeCategory === 'teacher');
  }
  get ancillaryStructures(): any[] {
    return (this.structures || []).filter((s: any) => s.employeeCategory === 'ancillary');
  }
  get filteredStructures(): any[] {
    let list = this.structures || [];
    if (this.categoryFilter === 'teacher') list = list.filter((s: any) => s.employeeCategory === 'teacher');
    if (this.categoryFilter === 'ancillary') list = list.filter((s: any) => s.employeeCategory === 'ancillary');
    const q = (this.searchQuery || '').toLowerCase().trim();
    if (q) {
      list = list.filter((s: any) => {
        const name = (s.name || '').toLowerCase();
        const cat = (s.employeeCategory || '').toLowerCase();
        const comps = (s.components || []).map((c: any) => (c.name || '').toLowerCase()).join(' ');
        return name.includes(q) || cat.includes(q) || comps.includes(q);
      });
    }
    return list;
  }

  formatComponents(s: any): string {
    const comps = s.components || [];
    if (!comps.length) return '—';
    return comps.map((c: any) => `${c.name} (${c.type})`).join(', ');
  }

  constructor(
    private payrollService: PayrollService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    activatePageLoad(this.router, this.destroy$, '/payroll/salary-structures', () => this.loadStructures());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
}

  loadStructures() {
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    this.payrollService
      .getSalaryStructures()
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data: any[]) => {
          this.structures = data || [];
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to load structures';
        }
      });
}

  addNew() {
    this.router.navigate(['/payroll/salary-structures/new']);
  }

  edit(id: string) {
    this.router.navigate(['/payroll/salary-structures', id, 'edit']);
  }

  delete(id: string, name: string) {
    if (!confirm(`Delete salary structure "${name}"?`)) return;
    this.payrollService.deleteSalaryStructure(id).subscribe({
      next: () => {
        this.success = 'Structure deleted';
        this.loadStructures();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = err?.error?.message || 'Delete failed';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }
}
