import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { StudentService } from '../../../services/student.service';
import { StudentRefreshService } from '../../../services/student-refresh.service';
import { ClassService } from '../../../services/class.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';

@Component({
  standalone: false,  selector: 'app-enroll-student',
  templateUrl: './enroll-student.component.html',
  styleUrls: ['./enroll-student.component.css']
})
export class EnrollStudentComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
loading = false;
  error = '';
  success = '';
  currencySymbol = '';
  schoolName = '';
  schoolAddress = '';
  schoolMotto = '';
  schoolLogo: string | null = null;
  students: any[] = [];
  filtered: any[] = [];
  classes: any[] = [];
  searchQuery = '';
  enrollingMap: { [studentId: string]: boolean } = {};
  deletingMap: { [studentId: string]: boolean } = {};
  // Stats and filters
  stats = {
    total: 0,
    male: 0,
    female: 0,
    boarder: 0,
    dayScholar: 0,
    byGrade: [] as Array<{ label: string; count: number }>
  };
  gradeOptions: string[] = [];
  selectedGrade: string = '';
  selectedType: string = '';
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;
constructor(
    private studentService: StudentService,
    private classService: ClassService,
    private settingsService: SettingsService,
    private authService: AuthService,
    private router: Router,
    private studentRefresh: StudentRefreshService,
    private cdr: ChangeDetectorRef
) {}

  ngOnInit(): void {
    this.loadSettings();
    activatePageLoad(this.router, this.destroy$, '/students/enroll_student', () => {
      this.loadClasses();
      this.loadUnenrolledStudents();
    });

    this.studentRefresh
      .onRefreshRequested()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadUnenrolledStudents());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.searchDebounce) {
      clearTimeout(this.searchDebounce);
    }
}

  async previewPdf(): Promise<void> {
    const header = (this.schoolName || this.schoolAddress || this.schoolLogo || this.schoolMotto)
      ? `
        <div class="school-header">
          ${this.schoolLogo ? `<div class="school-logo-wrapper"><img src="${this.resolveImage(this.schoolLogo)}" alt="School Logo" class="school-logo" /></div>` : `<div></div>`}
          <div class="school-text">
            ${this.schoolName ? `<h3>${this.schoolName}</h3>` : ``}
            ${this.schoolMotto ? `<p class="school-motto">${this.schoolMotto}</p>` : ``}
            ${this.schoolAddress ? `<p class="school-address">${this.schoolAddress}</p>` : ``}
          </div>
          <div></div>
        </div>
      ` : '';
    const table = this.buildPrintTableHtml();
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-10000px';
    container.style.top = '0';
    container.style.width = '800px';
    container.innerHTML = `
      <style>
        body { font-family: Arial, sans-serif; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f4f4f4; }
        .school-header { display: grid; grid-template-columns: 120px 1fr 120px; gap: 12px; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
        .school-logo { width: 100%; max-width: 100px; height: auto; object-fit: contain; }
        .school-text h3 { margin: 0; font-size: 18px; }
        .school-motto { font-style: italic; color: #555; margin: 4px 0; }
        .school-address { color: #666; margin: 2px 0; font-size: 12px; }
      </style>
      ${header}
      ${table}
    `;
    document.body.appendChild(container);
    try {
      const canvas = await html2canvas(container, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      const pdf = new jsPDF('p', 'mm', 'a4');
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      const pdfBlob = pdf.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      window.open(pdfUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
    } catch {
    } finally {
      document.body.removeChild(container);
    }
  }

  loadSettings(): void {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        this.currencySymbol = settings?.currencySymbol || '';
        this.schoolName = settings?.schoolName || '';
        this.schoolAddress = settings?.schoolAddress || '';
        this.schoolMotto = settings?.schoolMotto || '';
        this.schoolLogo = settings?.schoolLogo || null;
        this.cdr.markForCheck();
},
      error: () => {}
    });
  }

  canEnroll(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin') || this.authService.hasRole('teacher');
  }
  isAdmin(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  loadClasses(): void {
    this.classService
      .getClassesPaginated(1, 500)
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
        next: (resp) => {
          this.classes = Array.isArray(resp?.data) ? resp.data : [];
        },
        error: () => {
          this.classes = [];
        }
      });
}

  loadUnenrolledStudents(): void {
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    const search = this.searchQuery.trim() || undefined;
    this.studentService
      .getStudentsPaginated({
        unenrolled: true,
        page: 1,
        limit: 500,
        search,
        studentType: this.selectedType || undefined,
        grade: this.selectedGrade || undefined
      })
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response) => {
          if (response?.loadFailed) {
            this.error = response.errorMessage || 'Failed to load students';
            this.students = [];
            this.filtered = [];
            this.recomputeStats();
            return;
          }
          this.students = Array.isArray(response?.data) ? response.data : [];
          this.recomputeOptions();
          this.applyFilters();
        },
        error: (err: any) => {
          this.error = err?.error?.message || err?.message || 'Failed to load students';
          this.students = [];
          this.filtered = [];
          this.recomputeStats();
        }
      });
  }

  filter(): void {
    if (this.searchDebounce) {
      clearTimeout(this.searchDebounce);
    }
    this.searchDebounce = setTimeout(() => this.loadUnenrolledStudents(), 350);
}

  clearFilters(): void {
    this.selectedGrade = '';
    this.selectedType = '';
    this.searchQuery = '';
    this.loadUnenrolledStudents();
  }

  applyFilters(): void {
    this.filtered = [...this.students];
this.recomputeStats();
  }

  private recomputeOptions(): void {
    const gradesSet = new Set<string>();
    (this.students || []).forEach(s => {
      const g = (s.grade || s.classLevel || '').toString().trim();
      if (g) gradesSet.add(g);
    });
    this.gradeOptions = Array.from(gradesSet).sort((a, b) => a.localeCompare(b));
  }

  private recomputeStats(): void {
    const src = this.filtered;
    const byGradeMap = new Map<string, number>();
    let male = 0;
    let female = 0;
    let boarder = 0;
    let day = 0;
    src.forEach((s) => {
const g = (s.grade || s.classLevel || '—').toString();
      byGradeMap.set(g, (byGradeMap.get(g) || 0) + 1);
      const gender = (s.gender || '').toString().toLowerCase();
      if (gender === 'male') male++;
      else if (gender === 'female') female++;
      const type = (s.studentType || '').toString().toLowerCase();
      if (type === 'boarder') boarder++;
      else day++;
    });
    this.stats.total = src.length;
    this.stats.male = male;
    this.stats.female = female;
    this.stats.boarder = boarder;
    this.stats.dayScholar = day;
    this.stats.byGrade = Array.from(byGradeMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    this.cdr.markForCheck();
}

  enroll(student: any, classId: string): void {
    this.error = '';
    this.success = '';
    if (!this.canEnroll()) {
      this.error = 'You do not have permission to enroll students';
      return;
    }
    if (!classId) {
      this.error = 'Please select a class';
      return;
    }
    const sid = student?.id || student?.studentId;
    if (!sid) {
      this.error = 'Invalid student record';
      return;
    }
    this.enrollingMap[sid] = true;
    this.studentService.enrollStudent(String(sid), String(classId)).subscribe({
      next: () => {
        this.success = 'Student enrolled successfully';
        this.students = this.students.filter((s) => (s.id || s.studentId) !== sid);
        this.filtered = this.filtered.filter((s) => (s.id || s.studentId) !== sid);
        this.recomputeOptions();
        this.recomputeStats();
        this.enrollingMap[sid] = false;
        this.studentRefresh.requestRefresh();
        this.cdr.markForCheck();
},
      error: (err: any) => {
        this.error = err?.error?.message || err?.message || 'Failed to enroll student';
        this.enrollingMap[sid] = false;
        this.cdr.markForCheck();
}
    });
  }

printList(): void {
    const html = this.buildPrintHtml(true);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  }

  exportCsv(): void {
    const rows = [
      ['StudentNumber', 'FirstName', 'LastName', 'Gender', 'Phone', 'Grade', 'StudentType']
    ];
    this.filtered.forEach((s) => {
rows.push([
        String(s.studentNumber || ''),
        String(s.firstName || ''),
        String(s.lastName || ''),
        String(s.gender || ''),
        String(s.phoneNumber || ''),
        String(s.grade || s.classLevel || ''),
        String(s.studentType || '')
      ]);
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'unenrolled-students.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  resolveImage(path: string): string {
if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const origin = window.location.origin;
    return path.startsWith('/') ? `${origin}${path}` : `${origin}/${path}`;
  }

  buildPrintTableHtml(): string {
    const rows = this.filtered
      .map(
        (s) => `
<tr>
        <td>${s.studentNumber || '—'}</td>
        <td>${s.firstName || '—'}</td>
        <td>${s.lastName || '—'}</td>
        <td>${s.gender || '—'}</td>
        <td>${s.phoneNumber || '—'}</td>
        <td>${s.grade || s.classLevel || '—'}</td>
      </tr>
    `
      )
      .join('');
    const table =
      this.filtered.length > 0
        ? `
<table>
        <thead>
          <tr>
            <th>Student Number</th>
            <th>First Name</th>
            <th>Last Name</th>
            <th>Gender</th>
            <th>Phone</th>
            <th>Grade</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `
        : `<div>No Unenrolled Students</div>`;
    return `<h2 style="margin: 16px 0;">Registered Students Without Classes</h2>${table}`;
  }

  buildPrintHtml(print: boolean): string {
    const header =
      this.schoolName || this.schoolAddress || this.schoolLogo || this.schoolMotto
        ? `
<div class="school-header">
          ${this.schoolLogo ? `<div class="school-logo-wrapper"><img src="${this.resolveImage(this.schoolLogo)}" alt="School Logo" class="school-logo" /></div>` : `<div></div>`}
          <div class="school-text">
            ${this.schoolName ? `<h3>${this.schoolName}</h3>` : ``}
            ${this.schoolMotto ? `<p class="school-motto">${this.schoolMotto}</p>` : ``}
            ${this.schoolAddress ? `<p class="school-address">${this.schoolAddress}</p>` : ``}
          </div>
          <div></div>
        </div>
      `
        : '';
const table = this.buildPrintTableHtml();
    const printScript = print ? `<script>window.onload=function(){window.print();}</script>` : '';
    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Unenrolled Students</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; }
            h1 { margin: 0 0 12px 0; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #f4f4f4; }
            .school-header { display: grid; grid-template-columns: 120px 1fr 120px; gap: 12px; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
            .school-logo { width: 100%; max-width: 100px; height: auto; object-fit: contain; }
            .school-text h3 { margin: 0; font-size: 18px; }
            .school-motto { font-style: italic; color: #555; margin: 4px 0; }
            .school-address { color: #666; margin: 2px 0; font-size: 12px; }
          </style>
        </head>
        <body>
          ${header}
          ${table}
          ${printScript}
        </body>
      </html>
    `;
  }

  deleteStudentRecord(student: any): void {
    const sid = student?.id || student?.studentId;
    const name = `${student?.firstName || ''} ${student?.lastName || ''}`.trim();
    const number = student?.studentNumber || 'N/A';
    if (!sid) return;
    if (!this.isAdmin()) {
      this.error = 'You do not have permission to delete students';
      setTimeout(() => (this.error = ''), 4000);
      return;
    }
    const confirmed = confirm(
      `Are you sure you want to delete "${name || 'Student'}" (${number})? This will also delete related marks, invoices and the associated user account. This action cannot be undone.`
    );
if (!confirmed) return;
    this.deletingMap[sid] = true;
    this.error = '';
    this.success = '';
    this.studentService.deleteStudent(String(sid)).subscribe({
      next: (data: any) => {
        this.success = data?.message || 'Student deleted successfully';
        this.students = this.students.filter((s) => (s.id || s.studentId) !== sid);
        this.filtered = this.filtered.filter((s) => (s.id || s.studentId) !== sid);
        this.recomputeOptions();
        this.recomputeStats();
        this.deletingMap[sid] = false;
        setTimeout(() => (this.success = ''), 5000);
        this.cdr.markForCheck();
},
      error: (err: any) => {
        let msg = 'Failed to delete student';
        if (err?.status === 0 || err?.status === undefined) {
          msg = 'Cannot connect to server. Please ensure the backend server is running on port 3001.';
        } else if (err?.error) {
          if (typeof err.error === 'string') msg = err.error;
          else if (err.error.message) msg = err.error.message;
        } else if (err?.message) {
          msg = err.message;
        }
        this.error = msg;
        this.deletingMap[sid] = false;
        setTimeout(() => (this.error = ''), 5000);
        this.cdr.markForCheck();
}
    });
  }
}
