import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TeacherService } from '../../../services/teacher.service';
import { SubjectService } from '../../../services/subject.service';
import { ClassService } from '../../../services/class.service';
import { validatePhoneNumber } from '../../../utils/phone-validator';

@Component({
  selector: 'app-teacher-form',
  templateUrl: './teacher-form.component.html',
  styleUrls: ['./teacher-form.component.css']
})
export class TeacherFormComponent implements OnInit {
  teacher: any = {
    firstName: '',
    lastName: '',
    sex: '',
    phoneNumber: '',
    address: '',
    dateOfBirth: '',
    subjectIds: [],
    classIds: [],
    photo: null as string | null
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
  idCardLoading = false;

  // Phone validation error
  phoneNumberError = '';

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
          sex: data.sex || '',
          dateOfBirth: data.dateOfBirth?.split('T')[0],
          subjectIds: data.subjects?.map((s: any) => s.id) || [],
          classIds: data.classes?.map((c: any) => c.id) || [],
          photo: data.photo ?? null
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

  private calculateAge(dateString: string): number {
    const dob = new Date(dateString);
    if (isNaN(dob.getTime())) {
      return 0;
    }
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }

  validatePhoneNumber(): void {
    if (this.teacher.phoneNumber && this.teacher.phoneNumber.trim()) {
      const result = validatePhoneNumber(this.teacher.phoneNumber, false);
      this.phoneNumberError = result.isValid ? '' : (result.error || '');
      if (result.isValid && result.normalized) {
        this.teacher.phoneNumber = result.normalized;
      }
    } else {
      this.phoneNumberError = '';
    }
  }

  onSubmit() {
    this.error = '';
    this.success = '';
    this.phoneNumberError = '';
    this.submitting = true;

    // Validate phone number if provided
    if (this.teacher.phoneNumber && this.teacher.phoneNumber.trim()) {
      const phoneResult = validatePhoneNumber(this.teacher.phoneNumber, false);
      if (!phoneResult.isValid) {
        this.phoneNumberError = phoneResult.error || 'Invalid phone number';
        this.error = phoneResult.error || 'Please enter a valid phone number';
        this.submitting = false;
        return;
      }
      if (phoneResult.normalized) {
        this.teacher.phoneNumber = phoneResult.normalized;
      }
    }

    // Validate required fields
    if (!this.teacher.firstName || !this.teacher.lastName || !this.teacher.dateOfBirth || !this.teacher.sex) {
      this.error = 'Please fill in all required fields';
      this.submitting = false;
      return;
    }

    const age = this.calculateAge(this.teacher.dateOfBirth);
    if (age < 20 || age > 70) {
      this.error = 'Teacher age must be between 20 and 70 years';
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

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error = 'Please select an image file (JPEG, PNG, etc.)';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.teacher.photo = reader.result as string;
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  removePhoto(): void {
    this.teacher.photo = null;
  }

  private fetchIdCardPdf(action: 'preview' | 'download'): void {
    if (!this.teacher?.id) return;
    this.idCardLoading = true;
    this.error = '';
    this.teacherService.getTeacherIdCardPdf(this.teacher.id).subscribe({
      next: (blob) => {
        this.idCardLoading = false;
        const url = window.URL.createObjectURL(blob);
        const filename = `Teacher-ID-${this.teacher.teacherId || this.teacher.id}.pdf`;
        if (action === 'preview') {
          window.open(url, '_blank', 'noopener,noreferrer');
          setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
          window.URL.revokeObjectURL(url);
        }
      },
      error: (err) => {
        this.idCardLoading = false;
        this.error = err.error?.message || 'Failed to generate ID card';
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  previewIdCard(): void {
    this.fetchIdCardPdf('preview');
  }

  downloadIdCard(): void {
    this.fetchIdCardPdf('download');
  }
}
