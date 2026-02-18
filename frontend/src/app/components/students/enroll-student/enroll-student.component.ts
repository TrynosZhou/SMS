import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { StudentService } from '../../../services/student.service';
import { ClassService } from '../../../services/class.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-enroll-student',
  templateUrl: './enroll-student.component.html',
  styleUrls: ['./enroll-student.component.css']
})
export class EnrollStudentComponent implements OnInit {
  loading = false;
  error = '';
  success = '';
  currencySymbol = '';
  schoolName = '';
  schoolAddress = '';
  schoolMotto = '';
  schoolLogo: string | null = null;
  schoolLogo2: string | null = null;
  students: any[] = [];
  filtered: any[] = [];
  classes: any[] = [];
  searchQuery = '';
  enrollingMap: { [studentId: string]: boolean } = {};
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

  constructor(
    private studentService: StudentService,
    private classService: ClassService,
    private settingsService: SettingsService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadSettings();
    this.loadClasses();
    this.loadUnenrolledStudents();
  }

  loadSettings(): void {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        this.currencySymbol = settings?.currencySymbol || '';
        this.schoolName = settings?.schoolName || '';
        this.schoolAddress = settings?.schoolAddress || '';
        this.schoolMotto = settings?.schoolMotto || '';
        this.schoolLogo = settings?.schoolLogo || null;
        this.schoolLogo2 = settings?.schoolLogo2 || null;
      },
      error: () => {}
    });
  }

  canEnroll(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin') || this.authService.hasRole('teacher');
  }

  loadClasses(): void {
    this.classService.getClasses().subscribe({
      next: (data: any[]) => {
        this.classes = Array.isArray(data) ? data : [];
      },
      error: () => {}
    });
  }

  private isUnenrolled(student: any): boolean {
    const id = student?.classId || student?.class?.id || student?.classEntity?.id;
    return !id;
  }

  loadUnenrolledStudents(): void {
    this.loading = true;
    this.error = '';
    this.studentService.getStudents().subscribe({
      next: (data: any[]) => {
        const list = Array.isArray(data) ? data : [];
        this.students = list.filter(s => this.isUnenrolled(s) && (String(s.studentStatus).toLowerCase().includes('new')));
        this.recomputeOptions();
        this.applyFilters();
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err?.error?.message || err?.message || 'Failed to load students';
        this.students = [];
        this.filtered = [];
        this.loading = false;
      }
    });
  }

  filter(): void {
    this.applyFilters();
  }

  clearFilters(): void {
    this.selectedGrade = '';
    this.selectedType = '';
    this.applyFilters();
  }

  applyFilters(): void {
    const q = (this.searchQuery || '').toLowerCase().trim();
    let list = [...this.students];
    if (this.selectedGrade) {
      const g = this.selectedGrade.toLowerCase();
      list = list.filter(s => (s.grade || s.classLevel || '').toString().toLowerCase() === g);
    }
    if (this.selectedType) {
      const t = this.selectedType.toLowerCase();
      list = list.filter(s => (s.studentType || '').toString().toLowerCase() === t);
    }
    if (q) {
      list = list.filter(s =>
        (s.studentNumber || '').toString().toLowerCase().includes(q) ||
        (s.firstName || '').toString().toLowerCase().includes(q) ||
        (s.lastName || '').toString().toLowerCase().includes(q) ||
        (s.gender || '').toString().toLowerCase().includes(q) ||
        (s.phoneNumber || '').toString().toLowerCase().includes(q)
      );
    }
    this.filtered = list;
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
    let male = 0, female = 0, boarder = 0, day = 0;
    src.forEach(s => {
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
        // Remove student from lists
        this.students = this.students.filter(s => (s.id || s.studentId) !== sid);
        this.filtered = this.filtered.filter(s => (s.id || s.studentId) !== sid);
        this.recomputeOptions();
        this.recomputeStats();
        this.enrollingMap[sid] = false;
      },
      error: (err: any) => {
        this.error = err?.error?.message || err?.message || 'Failed to enroll student';
        this.enrollingMap[sid] = false;
      }
    });
  }

  previewList(): void {
    const content = document.getElementById('print-area');
    if (!content) return;
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) return;
    const header = (this.schoolName || this.schoolAddress || this.schoolLogo || this.schoolLogo2 || this.schoolMotto)
      ? `
        <div class="school-header">
          ${this.schoolLogo ? `<div class="school-logo-wrapper"><img src="${this.schoolLogo}" alt="School Logo" class="school-logo" /></div>` : `<div></div>`}
          <div class="school-text">
            ${this.schoolName ? `<h3>${this.schoolName}</h3>` : ``}
            ${this.schoolMotto ? `<p class="school-motto">${this.schoolMotto}</p>` : ``}
            ${this.schoolAddress ? `<p class="school-address">${this.schoolAddress}</p>` : ``}
          </div>
          ${this.schoolLogo2 ? `<div class="school-logo-wrapper"><img src="${this.schoolLogo2}" alt="School Logo 2" class="school-logo" /></div>` : `<div></div>`}
        </div>
      ` : '';
    win.document.write(`
      <html>
        <head>
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
          ${content.innerHTML}
        </body>
      </html>
    `);
    win.document.close();
  }

  printList(): void {
    const content = document.getElementById('print-area');
    if (!content) return;
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) return;
    const header = (this.schoolName || this.schoolAddress || this.schoolLogo || this.schoolLogo2 || this.schoolMotto)
      ? `
        <div class="school-header">
          ${this.schoolLogo ? `<div class="school-logo-wrapper"><img src="${this.schoolLogo}" alt="School Logo" class="school-logo" /></div>` : `<div></div>`}
          <div class="school-text">
            ${this.schoolName ? `<h3>${this.schoolName}</h3>` : ``}
            ${this.schoolMotto ? `<p class="school-motto">${this.schoolMotto}</p>` : ``}
            ${this.schoolAddress ? `<p class="school-address">${this.schoolAddress}</p>` : ``}
          </div>
          ${this.schoolLogo2 ? `<div class="school-logo-wrapper"><img src="${this.schoolLogo2}" alt="School Logo 2" class="school-logo" /></div>` : `<div></div>`}
        </div>
      ` : '';
    win.document.write(`
      <html>
        <head>
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
          ${content.innerHTML}
          <script>window.onload = function(){ window.print(); }</script>
        </body>
      </html>
    `);
    win.document.close();
  }

  exportCsv(): void {
    const rows = [
      ['StudentNumber', 'FirstName', 'LastName', 'Gender', 'Phone', 'Grade', 'StudentType']
    ];
    this.filtered.forEach(s => {
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
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
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
}
