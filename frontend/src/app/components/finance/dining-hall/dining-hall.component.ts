import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { StudentService } from '../../../services/student.service';
import { ClassService } from '../../../services/class.service';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

type DiningHallSortColumn = 'studentNumber' | 'lastName' | 'firstName' | 'className' | 'gender';

@Component({
  standalone: false,
  selector: 'app-dining-hall',
  templateUrl: './dining-hall.component.html',
  styleUrls: ['./dining-hall.component.css']
})
export class DiningHallComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly skeletonPlaceholders = [0, 1, 2, 3, 4, 5];

  /** Students taking dining hall (DH) meals. */
  students: any[] = [];
  displayedStudents: any[] = [];
  classes: any[] = [];
  selectedStudentIds = new Set<string>();

  loading = false;
  loadFailed = false;
  error = '';
  searchQuery = '';
  selectedClass = '';
  sortColumn: DiningHallSortColumn = 'lastName';
  sortDir: 'asc' | 'desc' = 'asc';
  lastLoadedAt: Date | null = null;

  showDHReceiptsReport = false;
  dhReceipts: any[] = [];
  dhReceiptsTotal = 0;
  dhLoading = false;

  // School settings for PDF
  schoolName = '';
  schoolLogo = '';

  constructor(
    private studentService: StudentService,
    private classService: ClassService,
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const pagePath = (this.router.url || '').split('?')[0];
    activatePageLoad(this.router, this.destroy$, pagePath, () => {
      this.loadSettings();
      this.loadClasses();
      this.loadStudents();
    });
  }

  loadSettings(): void {
    this.settingsService.getSettings().pipe(takeUntil(this.destroy$)).subscribe({
      next: (s: any) => {
        this.schoolName = s?.schoolName || '';
        this.schoolLogo = s?.schoolLogo || '';
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Error loading settings:', err)
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get dashboardStats() {
    const list = this.displayedStudents;
    let male = 0;
    let female = 0;
    const classNames = new Set<string>();
    for (const student of list) {
      const gender = String(student?.gender || '').toLowerCase();
      if (gender === 'male') male++;
      else if (gender === 'female') female++;
      const className = this.getStudentClassName(student);
      if (className && className !== 'N/A') classNames.add(className);
    }
    return { total: list.length, male, female, classes: classNames.size };
  }

  get selectedCount(): number {
    return this.selectedStudentIds.size;
  }

  isSelected(id: string): boolean {
    return this.selectedStudentIds.has(id);
  }

  toggleStudentSelection(id: string, checked: boolean): void {
    if (checked) {
      this.selectedStudentIds.add(id);
    } else {
      this.selectedStudentIds.delete(id);
    }
    this.cdr.markForCheck();
  }

  areAllVisibleSelected(): boolean {
    if (!this.displayedStudents.length) return false;
    return this.displayedStudents.every(s => this.selectedStudentIds.has(s.id));
  }

  toggleSelectAllVisible(checked: boolean): void {
    if (checked) {
      this.displayedStudents.forEach(s => this.selectedStudentIds.add(s.id));
    } else {
      this.displayedStudents.forEach(s => this.selectedStudentIds.delete(s.id));
    }
    this.cdr.markForCheck();
  }

  getStudentTypeLabel(student: any): string {
    const t = String(student?.studentType || '').trim().toLowerCase();
    if (t === 'day scholar') return 'Day';
    if (t === 'boarder') return 'Boarder';
    return t || 'Day';
  }

  getPhone(student: any): string {
    return student?.contactNumber || student?.phoneNumber || '—';
  }

  viewStudentDetails(student: any): void {
    // Navigate to student profile or open modal (matching StudentListComponent behavior)
    this.router.navigate(['/students', student.id]);
  }

  editStudent(id: string): void {
    this.router.navigate(['/students', id, 'edit']);
  }

  deleteStudent(id: string, name: string, number: string): void {
    if (window.confirm(`Are you sure you want to delete student ${name} (${number})?`)) {
      this.studentService.deleteStudent(id).subscribe({
        next: () => {
          this.loadStudents();
        },
        error: (err) => {
          this.error = 'Failed to delete student.';
          this.cdr.markForCheck();
        }
      });
    }
  }

  hasActiveFilters(): boolean {
    return !!this.searchQuery.trim() || !!this.selectedClass;
  }

  clearAlert(): void {
    this.error = '';
    this.cdr.markForCheck();
  }

  loadClasses(): void {
    this.classService
      .getClasses()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (classes) => {
          this.classes = Array.isArray(classes) ? classes : [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.classes = [];
        }
      });
  }

  loadStudents(): void {
    this.loading = true;
    this.loadFailed = false;
    this.studentService
      .getStudentsPaginated({ usesDiningHall: true, studentType: 'Day Scholar', limit: 1000 })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response: any) => {
          const data = Array.isArray(response?.data) ? response.data : [];
          this.students = data
            .filter((s: any) => String(s?.studentType || '').toLowerCase() !== 'boarder')
            .map((student: any) => {
              const normalized = { ...student };
              if (normalized.classEntity && !normalized.class) {
                normalized.class = normalized.classEntity;
              }
              return normalized;
            });
          this.lastLoadedAt = new Date();
          this.applyFilters();
        },
        error: (err) => {
          console.error('Error loading dining hall students:', err);
          this.students = [];
          this.displayedStudents = [];
          this.loadFailed = true;
          this.error = 'Failed to load dining hall students.';
        }
      });
  }

  refreshStudents(): void {
    this.loadStudents();
  }

  onSearchSubmit(value: string): void {
    this.searchQuery = (value || '').trim();
    this.applyFilters();
  }

  onClassChange(): void {
    this.applyFilters();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedClass = '';
    this.applyFilters();
  }

  setSort(column: DiningHallSortColumn): void {
    if (this.sortColumn === column) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDir = 'asc';
    }
    this.applyFilters();
  }

  sortIndicator(column: DiningHallSortColumn): string {
    if (this.sortColumn !== column) return '↕';
    return this.sortDir === 'asc' ? '↑' : '↓';
  }

  getStudentClassName(student: any): string {
    if (!student) return 'N/A';
    if (student.class?.name) return student.class.name;
    if (student.classEntity?.name) return student.classEntity.name;
    if (student.classId) {
      const found = this.classes.find(c => c.id === student.classId);
      if (found?.name) return found.name;
    }
    return 'N/A';
  }

  exportCsv(): void {
    const rows = this.displayedStudents.map((student: any) => ({
      StudentID: student.studentNumber || '',
      LastName: student.lastName || '',
      FirstName: student.firstName || '',
      Class: this.getStudentClassName(student),
      Sex: student.gender || ''
    }));

    if (!rows.length) {
      this.error = 'No students available to export for the current filters.';
      this.cdr.markForCheck();
      return;
    }

    const header = Object.keys(rows[0]);
    const csvContent = [
      header.join(','),
      ...rows.map(row =>
        header
          .map(key => {
            const value = (row as any)[key] ?? '';
            return `"${String(value).replace(/"/g, '""')}"`;
          })
          .join(',')
      )
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'dining-hall-students.csv';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  printReport(): void {
    window.print();
  }

  toggleDHReceipts(): void {
    this.showDHReceiptsReport = !this.showDHReceiptsReport;
    if (this.showDHReceiptsReport && this.dhReceipts.length === 0) {
      this.fetchDHReceipts();
    }
    this.cdr.markForCheck();
  }

  fetchDHReceipts(): void {
    this.dhLoading = true;
    this.dhReceipts = [];
    this.dhReceiptsTotal = 0;
    this.financeService.getInvoicesPaginated({ hasDiningHallFee: true, limit: 1000 }).subscribe({
      next: (resp) => {
        this.dhLoading = false;
        this.dhReceipts = resp.data || [];
        this.dhReceiptsTotal = resp.totalDiningHallAmount || 0;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error fetching DH receipts:', err);
        this.dhLoading = false;
        this.error = 'Failed to load DH receipts.';
        this.cdr.markForCheck();
      }
    });
  }

  async previewDHReceiptsPDF(): Promise<void> {
    if (!this.dhReceipts.length) return;

    const element = document.getElementById('dh-receipts-pdf-area');
    if (!element) {
      this.error = 'Receipts content not found.';
      this.cdr.markForCheck();
      return;
    }

    const printContainer = element.querySelector('.receipts-print-container') as HTMLElement;
    if (!printContainer) return;

    this.dhLoading = true;
    this.cdr.markForCheck();

    try {
      // Temporarily enable PDF mode for styling
      printContainer.classList.add('pdf-mode');
      
      // Wait for rendering
      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = await html2canvas(printContainer, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      
      const pdfUrl = URL.createObjectURL(pdf.output('blob'));
      window.open(pdfUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
    } catch (err) {
      console.error('PDF generation error:', err);
      this.error = 'Failed to generate PDF preview.';
    } finally {
      printContainer.classList.remove('pdf-mode');
      this.dhLoading = false;
      this.cdr.markForCheck();
    }
  }

  private applyFilters(): void {
    const query = this.searchQuery.trim().toLowerCase();
    let list = this.students.slice();

    if (this.selectedClass) {
      list = list.filter(student => this.matchesClass(student, this.selectedClass));
    }

    if (query) {
      list = list.filter(student => {
        const haystack = `${student?.firstName || ''} ${student?.lastName || ''} ${student?.studentNumber || ''}`.toLowerCase();
        return haystack.includes(query);
      });
    }

    this.displayedStudents = this.sortRows(list);
    this.cdr.markForCheck();
  }

  private matchesClass(student: any, classId: string): boolean {
    const studentClassId = student?.classId || student?.class?.id || student?.classEntity?.id || '';
    return String(studentClassId) === String(classId);
  }

  private sortRows(list: any[]): any[] {
    const direction = this.sortDir === 'asc' ? 1 : -1;
    const column = this.sortColumn;
    return list.slice().sort((a, b) => {
      const left = this.sortValue(a, column);
      const right = this.sortValue(b, column);
      return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }) * direction;
    });
  }

  private sortValue(student: any, column: DiningHallSortColumn): string {
    if (column === 'className') return this.getStudentClassName(student);
    return String(student?.[column] || '');
  }
}
