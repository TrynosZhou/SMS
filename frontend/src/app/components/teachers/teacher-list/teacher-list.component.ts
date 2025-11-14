import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TeacherService } from '../../../services/teacher.service';
import { SubjectService } from '../../../services/subject.service';
import { ClassService } from '../../../services/class.service';

@Component({
  selector: 'app-teacher-list',
  templateUrl: './teacher-list.component.html',
  styleUrls: ['./teacher-list.component.css']
})
export class TeacherListComponent implements OnInit {
  teachers: any[] = [];
  filteredTeachers: any[] = [];
  allSubjects: any[] = [];
  allClasses: any[] = [];
  loading = false;
  searchQuery = '';
  selectedSubjectFilter = '';
  selectedClassFilter = '';
  viewMode: 'grid' | 'list' = 'grid';
  selectedTeacher: any = null;

  constructor(
    private teacherService: TeacherService,
    private subjectService: SubjectService,
    private classService: ClassService,
    private router: Router
  ) { }

  ngOnInit() {
    this.loadTeachers();
    this.loadSubjects();
    this.loadClasses();
  }

  loadTeachers() {
    this.loading = true;
    this.teacherService.getTeachers().subscribe({
      next: (data: any) => {
        this.teachers = data || [];
        this.filteredTeachers = this.teachers;
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading teachers:', err);
        this.loading = false;
        this.teachers = [];
        this.filteredTeachers = [];
      }
    });
  }

  loadSubjects() {
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        this.allSubjects = data || [];
      },
      error: (err: any) => {
        console.error('Error loading subjects:', err);
      }
    });
  }

  loadClasses() {
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        this.allClasses = data || [];
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
      }
    });
  }

  filterTeachers() {
    let filtered = [...this.teachers];

    // Search filter
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(teacher => {
        const fullName = `${teacher.firstName} ${teacher.lastName}`.toLowerCase();
        const empNumber = (teacher.employeeNumber || '').toLowerCase();
        const phone = (teacher.phoneNumber || '').toLowerCase();
        return fullName.includes(query) || empNumber.includes(query) || phone.includes(query);
      });
    }

    // Subject filter
    if (this.selectedSubjectFilter) {
      filtered = filtered.filter(teacher => {
        return teacher.subjects && teacher.subjects.some((s: any) => s.id === this.selectedSubjectFilter);
      });
    }

    // Class filter
    if (this.selectedClassFilter) {
      filtered = filtered.filter(teacher => {
        return teacher.classes && teacher.classes.some((c: any) => c.id === this.selectedClassFilter);
      });
    }

    this.filteredTeachers = filtered;
  }

  clearFilters() {
    this.searchQuery = '';
    this.selectedSubjectFilter = '';
    this.selectedClassFilter = '';
    this.filterTeachers();
  }

  hasActiveFilters(): boolean {
    return !!(this.searchQuery || this.selectedSubjectFilter || this.selectedClassFilter);
  }

  viewTeacherDetails(teacher: any) {
    this.selectedTeacher = teacher;
  }

  closeTeacherDetails() {
    this.selectedTeacher = null;
  }

  editTeacher(id: string) {
    this.router.navigate([`/teachers/${id}/edit`]);
  }

  getTotalSubjects(): number {
    const subjectSet = new Set();
    this.teachers.forEach(teacher => {
      if (teacher.subjects) {
        teacher.subjects.forEach((s: any) => subjectSet.add(s.id));
      }
    });
    return subjectSet.size;
  }

  getTotalClasses(): number {
    const classSet = new Set();
    this.teachers.forEach(teacher => {
      if (teacher.classes) {
        teacher.classes.forEach((c: any) => classSet.add(c.id));
      }
    });
    return classSet.size;
  }

  getAverageSubjectsPerTeacher(): number {
    if (this.teachers.length === 0) return 0;
    const total = this.teachers.reduce((sum, teacher) => {
      return sum + (teacher.subjects ? teacher.subjects.length : 0);
    }, 0);
    return Math.round((total / this.teachers.length) * 10) / 10;
  }
}
