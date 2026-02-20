import { Component, OnInit } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TeacherService } from '../../../services/teacher.service';
import { SubjectService } from '../../../services/subject.service';
import { ClassService } from '../../../services/class.service';

@Component({
  selector: 'app-allocate-classes',
  templateUrl: './allocate-classes.component.html',
  styleUrls: ['./allocate-classes.component.css']
})
export class AllocateClassesComponent implements OnInit {
  loading = false;
  saving = false;
  error = '';
  success = '';

  teachers: any[] = [];
  subjects: any[] = [];
  classes: any[] = [];

  filteredTeachers: any[] = [];
  filteredSubjects: any[] = [];
  filteredClasses: any[] = [];

  teacherSearch = '';
  subjectSearch = '';
  classSearch = '';

  selectedTeacher: any = null;
  selectedTeacherId: string = '';
  selectedSubjectIds: string[] = [];
  selectedClassIds: string[] = [];
  bulkMode = false;
  selectedTeacherIds: string[] = [];
  bulkProgress = { total: 0, done: 0, failed: 0 };

  constructor(
    private teacherService: TeacherService,
    private subjectService: SubjectService,
    private classService: ClassService
  ) {}

  ngOnInit(): void {
    this.loadTeachers();
    this.loadSubjects();
    this.loadClasses();
  }

  loadTeachers() {
    this.loading = true;
    this.teacherService.getTeachers().subscribe({
      next: (data: any[]) => {
        this.teachers = Array.isArray(data) ? data : [];
        this.filteredTeachers = this.teachers;
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load teachers';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  loadSubjects() {
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        this.subjects = Array.isArray(data) ? data : (Array.isArray((data || {}).subjects) ? (data as any).subjects : []);
        this.filteredSubjects = this.subjects;
      },
      error: () => {
        this.error = 'Failed to load subjects';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  loadClasses() {
    this.classService.getClasses().subscribe({
      next: (data: any[]) => {
        this.classes = Array.isArray(data) ? data : [];
        this.filteredClasses = this.classes;
      },
      error: () => {
        this.error = 'Failed to load classes';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  onSelectTeacher(id: string) {
    this.selectedTeacherId = id || '';
    const t = this.teachers.find(x => String(x.id) === String(id));
    this.selectedTeacher = t || null;
    if (this.selectedTeacher) {
      this.selectedSubjectIds = (this.selectedTeacher.subjects || []).map((s: any) => s.id);
      this.selectedClassIds = (this.selectedTeacher.classes || []).map((c: any) => c.id);
    } else {
      this.selectedSubjectIds = [];
      this.selectedClassIds = [];
    }
  }

  toggleTeacher(id: string) {
    const idx = this.selectedTeacherIds.indexOf(id);
    if (idx >= 0) this.selectedTeacherIds.splice(idx, 1);
    else this.selectedTeacherIds.push(id);
  }

  isTeacherSelected(id: string): boolean {
    return this.selectedTeacherIds.includes(id);
  }

  selectAllFilteredTeachers() {
    this.selectedTeacherIds = this.filteredTeachers.map(t => String(t.id));
  }

  clearTeacherSelection() {
    this.selectedTeacherIds = [];
  }

  filterTeachers() {
    const q = (this.teacherSearch || '').toLowerCase().trim();
    if (!q) {
      this.filteredTeachers = this.teachers;
      return;
    }
    this.filteredTeachers = this.teachers.filter(t =>
      (`${t.firstName || ''} ${t.lastName || ''}`.toLowerCase().includes(q)) ||
      (String(t.teacherId || '').toLowerCase().includes(q))
    );
  }

  filterSubjects() {
    const q = (this.subjectSearch || '').toLowerCase().trim();
    if (!q) {
      this.filteredSubjects = this.subjects;
      return;
    }
    this.filteredSubjects = this.subjects.filter(s => (s.name || '').toLowerCase().includes(q));
  }

  filterClasses() {
    const q = (this.classSearch || '').toLowerCase().trim();
    if (!q) {
      this.filteredClasses = this.classes;
      return;
    }
    this.filteredClasses = this.classes.filter(c => (c.name || '').toLowerCase().includes(q));
  }

  toggleSubject(id: string) {
    const i = this.selectedSubjectIds.indexOf(id);
    if (i >= 0) this.selectedSubjectIds.splice(i, 1);
    else this.selectedSubjectIds.push(id);
  }

  toggleClass(id: string) {
    const i = this.selectedClassIds.indexOf(id);
    if (i >= 0) this.selectedClassIds.splice(i, 1);
    else this.selectedClassIds.push(id);
  }

  hasChanges(): boolean {
    if (this.bulkMode) {
      return this.selectedTeacherIds.length > 0 && (this.selectedSubjectIds.length > 0 || this.selectedClassIds.length > 0);
    } else {
      if (!this.selectedTeacher) return false;
      const currentSubjects = (this.selectedTeacher.subjects || []).map((s: any) => s.id).sort().join(',');
      const currentClasses = (this.selectedTeacher.classes || []).map((c: any) => c.id).sort().join(',');
      const nextSubjects = [...this.selectedSubjectIds].sort().join(',');
      const nextClasses = [...this.selectedClassIds].sort().join(',');
      return currentSubjects !== nextSubjects || currentClasses !== nextClasses;
    }
  }

  save() {
    if (this.bulkMode) {
      if (this.selectedTeacherIds.length === 0) return;
      this.error = '';
      this.success = '';
      this.saving = true;
      this.bulkProgress = { total: this.selectedTeacherIds.length, done: 0, failed: 0 };
      const payload = { subjectIds: this.selectedSubjectIds, classIds: this.selectedClassIds };
      const requests = this.selectedTeacherIds.map(id =>
        this.teacherService.updateTeacher(id, payload).pipe(
          catchError(() => of({ __failed: true }))
        )
      );
      forkJoin(requests).subscribe({
        next: (results: any[]) => {
          const failed = results.filter(r => r && r.__failed).length;
          const done = results.length - failed;
          this.bulkProgress = { total: results.length, done, failed };
          this.success = failed === 0 ? 'Assignments saved for all selected teachers' : `Saved for ${done}, failed for ${failed}`;
          this.saving = false;
          setTimeout(() => this.success = '', 5000);
        },
        error: () => {
          this.error = 'Bulk save failed';
          this.saving = false;
          setTimeout(() => this.error = '', 5000);
        }
      });
      return;
    }
    if (!this.selectedTeacher) return;
    this.error = '';
    this.success = '';
    this.saving = true;
    const payload: any = {
      subjectIds: this.selectedSubjectIds,
      classIds: this.selectedClassIds
    };
    this.teacherService.updateTeacher(this.selectedTeacher.id, payload).subscribe({
      next: (resp: any) => {
        this.success = resp?.message || 'Assignments saved';
        this.saving = false;
        setTimeout(() => this.success = '', 4000);
        this.teacherService.getTeacherById(this.selectedTeacher.id).subscribe({
          next: (fresh: any) => {
            this.selectedTeacher = fresh?.teacher || fresh;
          },
          error: () => {}
        });
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Failed to save assignments';
        this.saving = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }
}
