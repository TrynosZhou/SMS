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
  unallocatedTeachers: any[] = [];
  selectedClassFor: { [teacherId: string]: string } = {};
  selectedSubjectFor: { [teacherId: string]: string } = {};
  unallocPaged: any[] = [];
  unallocPage = 1;
  unallocPageSize = 10;
  unallocTotalPages = 1;
  unallocSortKey: 'name' | 'employeeId' = 'name';
  unallocSortDir: 'asc' | 'desc' = 'asc';

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
        this.unallocatedTeachers = this.teachers.filter(t => !t.classes || t.classes.length === 0);
        this.loading = false;
        this.refreshUnallocatedView();
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
      this.unallocatedTeachers = this.teachers.filter(t => !t.classes || t.classes.length === 0);
      this.refreshUnallocatedView();
      return;
    }
    const allFiltered = this.teachers.filter(t =>
      (`${t.firstName || ''} ${t.lastName || ''}`.toLowerCase().includes(q)) ||
      (String(t.teacherId || '').toLowerCase().includes(q))
    );
    this.filteredTeachers = allFiltered;
    this.unallocatedTeachers = allFiltered.filter(t => !t.classes || t.classes.length === 0);
    this.refreshUnallocatedView();
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
          this.loadTeachers();
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
        this.loadTeachers();
        this.unallocPage = 1;
        this.refreshUnallocatedView();
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Failed to save assignments';
        this.saving = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  allocateClassForTeacher(teacherId: string) {
    const subjectId = this.selectedSubjectFor[teacherId];
    const classId = this.selectedClassFor[teacherId];
    if (!subjectId) {
      this.error = 'Please select a subject first';
      setTimeout(() => this.error = '', 4000);
      return;
    }
    if (!classId) {
      this.error = 'Please select a class to allocate';
      setTimeout(() => this.error = '', 4000);
      return;
    }
    this.saving = true;
    this.error = '';
    this.success = '';
    this.teacherService.getTeacherById(teacherId).subscribe({
      next: (fresh: any) => {
        const teacher = fresh?.teacher || fresh || {};
        const currentSubjectIds = Array.isArray(teacher.subjects) ? teacher.subjects.map((s: any) => s.id) : [];
        const currentClassIds = Array.isArray(teacher.classes) ? teacher.classes.map((c: any) => c.id) : [];
        const nextSubjectIds = Array.from(new Set([...currentSubjectIds, subjectId]));
        if (currentClassIds.includes(classId)) {
          this.error = 'Teacher already allocated to the selected class';
          this.saving = false;
          setTimeout(() => this.error = '', 4000);
          return;
        }
        const nextClassIds = Array.from(new Set([...currentClassIds, classId]));
        this.teacherService.updateTeacher(teacherId, { subjectIds: nextSubjectIds, classIds: nextClassIds }).subscribe({
          next: (resp: any) => {
            this.success = resp?.message || 'Class allocated to teacher';
            this.saving = false;
            setTimeout(() => this.success = '', 4000);
            const wantsMore = window.confirm('Allocate another class to this teacher?');
            if (wantsMore) {
              this.selectedClassFor[teacherId] = null as any;
            } else {
              this.loadTeachers();
            }
          },
          error: (err: any) => {
            this.error = err?.error?.message || 'Failed to allocate class';
            this.saving = false;
            setTimeout(() => this.error = '', 5000);
          }
        });
      },
      error: () => {
        this.error = 'Failed to load teacher details';
        this.saving = false;
        setTimeout(() => this.error = '', 4000);
      }
    });
  }

  deleteTeacher(teacherId: string, teacherName: string, teacherCode: string) {
    if (!confirm(`Are you sure you want to delete teacher "${teacherName}" (${teacherCode})? This action cannot be undone.`)) {
      return;
    }
    this.loading = true;
    this.error = '';
    this.success = '';
    this.teacherService.deleteTeacher(teacherId).subscribe({
      next: (data: any) => {
        this.success = data?.message || 'Teacher deleted successfully';
        this.loading = false;
        this.loadTeachers();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to delete teacher';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  refreshUnallocatedView() {
    const arr = [...this.unallocatedTeachers];
    arr.sort((a: any, b: any) => {
      const aName = `${(a.firstName || '').toLowerCase()} ${(a.lastName || '').toLowerCase()}`.trim();
      const bName = `${(b.firstName || '').toLowerCase()} ${(b.lastName || '').toLowerCase()}`.trim();
      const aEmp = String(a.teacherId || a.id || '').toLowerCase();
      const bEmp = String(b.teacherId || b.id || '').toLowerCase();
      let cmp = 0;
      if (this.unallocSortKey === 'name') cmp = aName.localeCompare(bName);
      else cmp = aEmp.localeCompare(bEmp);
      return this.unallocSortDir === 'asc' ? cmp : -cmp;
    });
    this.unallocTotalPages = Math.max(1, Math.ceil(arr.length / this.unallocPageSize));
    this.unallocPage = Math.min(this.unallocPage, this.unallocTotalPages);
    const start = (this.unallocPage - 1) * this.unallocPageSize;
    this.unallocPaged = arr.slice(start, start + this.unallocPageSize);
  }

  toggleUnallocSort(key: 'name' | 'employeeId') {
    if (this.unallocSortKey === key) {
      this.unallocSortDir = this.unallocSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.unallocSortKey = key;
      this.unallocSortDir = 'asc';
    }
    this.refreshUnallocatedView();
  }

  onUnallocPageChange(page: number) {
    if (page < 1 || page > this.unallocTotalPages || page === this.unallocPage) return;
    this.unallocPage = page;
    this.refreshUnallocatedView();
  }

  onUnallocPageSizeChange(size: number | string) {
    const v = Number(size);
    this.unallocPageSize = Number.isFinite(v) && v > 0 ? v : this.unallocPageSize;
    this.unallocPage = 1;
    this.refreshUnallocatedView();
  }

  exportUnallocatedCSV() {
    const rows = this.unallocatedTeachers.map(t => [
      t.teacherId || '',
      `${t.firstName || ''}`.trim(),
      `${t.lastName || ''}`.trim(),
      t.phoneNumber || '',
      t.sex || ''
    ]);
    const headers = ['Employee ID', 'First Name', 'Last Name', 'Phone', 'Gender'];
    const csv = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Unallocated_Teachers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}
