import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TeacherService } from '../../../services/teacher.service';
import { SubjectService } from '../../../services/subject.service';
import { ClassService } from '../../../services/class.service';

@Component({
  selector: 'app-teacher-form',
  templateUrl: './teacher-form.component.html',
  styleUrls: ['./teacher-form.component.css']
})
export class TeacherFormComponent implements OnInit {
  teacher: any = {
    firstName: '',
    lastName: '',
    phoneNumber: '',
    address: '',
    dateOfBirth: '',
    subjectIds: [],
    classIds: []
  };
  subjects: any[] = [];
  classes: any[] = [];
  filteredSubjects: any[] = [];
  filteredClasses: any[] = [];
  subjectSearchQuery = '';
  classSearchQuery = '';
  isEdit = false;
  error = '';
  success = '';
  submitting = false;
  maxDate = '';

  constructor(
    private teacherService: TeacherService,
    private subjectService: SubjectService,
    private classService: ClassService,
    private route: ActivatedRoute,
    public router: Router
  ) {
    // Set max date to today (for date of birth)
    const today = new Date();
    this.maxDate = today.toISOString().split('T')[0];
  }

  ngOnInit() {
    this.loadSubjects();
    this.loadClasses();
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.isEdit = true;
      this.loadTeacher(id);
    }
  }

  loadSubjects() {
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        this.subjects = data;
        this.filteredSubjects = data;
      },
      error: (err: any) => {
        console.error('Error loading subjects:', err);
        this.error = 'Failed to load subjects';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  loadClasses() {
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        this.classes = data;
        this.filteredClasses = data;
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
        this.error = 'Failed to load classes';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  loadTeacher(id: string) {
    this.teacherService.getTeacherById(id).subscribe({
      next: (data: any) => {
        this.teacher = {
          ...data,
          dateOfBirth: data.dateOfBirth?.split('T')[0],
          subjectIds: data.subjects?.map((s: any) => s.id) || [],
          classIds: data.classes?.map((c: any) => c.id) || []
        };
      },
      error: (err: any) => {
        this.error = 'Failed to load teacher';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  filterSubjects() {
    if (!this.subjectSearchQuery.trim()) {
      this.filteredSubjects = this.subjects;
      return;
    }
    const query = this.subjectSearchQuery.toLowerCase();
    this.filteredSubjects = this.subjects.filter(subject =>
      subject.name.toLowerCase().includes(query)
    );
  }

  filterClasses() {
    if (!this.classSearchQuery.trim()) {
      this.filteredClasses = this.classes;
      return;
    }
    const query = this.classSearchQuery.toLowerCase();
    this.filteredClasses = this.classes.filter(cls =>
      cls.name.toLowerCase().includes(query)
    );
  }

  onSubmit() {
    this.error = '';
    this.success = '';
    this.submitting = true;

    // Validate required fields
    if (!this.teacher.firstName || !this.teacher.lastName) {
      this.error = 'Please fill in all required fields';
      this.submitting = false;
      return;
    }

    if (this.isEdit) {
      // Don't send teacherId in update (it cannot be changed)
      const updateData = { ...this.teacher };
      delete updateData.teacherId;
      
      this.teacherService.updateTeacher(this.teacher.id, updateData).subscribe({
        next: () => {
          this.success = 'Teacher updated successfully';
          this.submitting = false;
          setTimeout(() => this.router.navigate(['/teachers']), 1500);
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to update teacher';
          this.submitting = false;
          setTimeout(() => this.error = '', 5000);
        }
      });
    } else {
      // For new teachers, don't send teacherId (it will be auto-generated)
      const teacherData = { ...this.teacher };
      delete teacherData.teacherId; // Remove teacherId, it will be auto-generated
      
      this.teacherService.createTeacher(teacherData).subscribe({
        next: (response: any) => {
          this.success = response.message || 'Teacher registered successfully';
          this.submitting = false;
          setTimeout(() => this.router.navigate(['/teachers']), 1500);
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to register teacher';
          this.submitting = false;
          setTimeout(() => this.error = '', 5000);
        }
      });
    }
  }

  toggleSubject(subjectId: string) {
    const index = this.teacher.subjectIds.indexOf(subjectId);
    if (index > -1) {
      this.teacher.subjectIds.splice(index, 1);
    } else {
      this.teacher.subjectIds.push(subjectId);
    }
  }

  toggleClass(classId: string) {
    const index = this.teacher.classIds.indexOf(classId);
    if (index > -1) {
      this.teacher.classIds.splice(index, 1);
    } else {
      this.teacher.classIds.push(classId);
    }
  }
}
