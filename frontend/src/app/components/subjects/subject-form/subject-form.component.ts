import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SubjectService } from '../../../services/subject.service';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  selector: 'app-subject-form',
  templateUrl: './subject-form.component.html',
  styleUrls: ['./subject-form.component.css'],
  animations: [
    trigger('fadeInOut', [
      state('void', style({ opacity: 0, transform: 'translateY(-10px)' })),
      transition(':enter', [
        animate('300ms ease-in', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-out', style({ opacity: 0, transform: 'translateY(-10px)' }))
      ])
    ])
  ]
})
export class SubjectFormComponent implements OnInit {
  subject: any = {
    name: '',
    code: '',
    description: '',
    isActive: true
  };
  isEdit = false;
  error = '';
  success = '';
  submitting = false;
  
  // Form validation
  fieldErrors: any = {};
  touchedFields: Set<string> = new Set();

  constructor(
    private subjectService: SubjectService,
    private route: ActivatedRoute,
    public router: Router
  ) { }

  ngOnInit() {
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.isEdit = true;
      this.loadSubject(id);
    }
  }

  loadSubject(id: string) {
    this.subjectService.getSubjectById(id).subscribe({
      next: (data: any) => {
        this.subject = data;
      },
      error: (err: any) => {
        this.error = 'Failed to load subject';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  onCodeChange() {
    // Auto-uppercase the code as user types
    if (this.subject.code) {
      this.subject.code = this.subject.code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    if (this.touchedFields.has('code')) {
      this.validateField('code');
    }
  }

  validateField(fieldName: string) {
    this.touchedFields.add(fieldName);
    const value = this.subject[fieldName];
    
    switch (fieldName) {
      case 'name':
        if (!value || value.trim() === '') {
          this.fieldErrors[fieldName] = 'Subject name is required';
        } else if (value.length > 100) {
          this.fieldErrors[fieldName] = 'Subject name must be 100 characters or less';
        } else {
          delete this.fieldErrors[fieldName];
        }
        break;
      case 'code':
        if (!value || value.trim() === '') {
          this.fieldErrors[fieldName] = 'Subject code is required';
        } else if (value.length > 20) {
          this.fieldErrors[fieldName] = 'Subject code must be 20 characters or less';
        } else if (!/^[A-Z0-9]+$/.test(value)) {
          this.fieldErrors[fieldName] = 'Subject code must contain only uppercase letters and numbers';
        } else if (value.length < 2) {
          this.fieldErrors[fieldName] = 'Subject code must be at least 2 characters';
        } else {
          delete this.fieldErrors[fieldName];
        }
        break;
      case 'description':
        if (value && value.length > 500) {
          this.fieldErrors[fieldName] = 'Description must be 500 characters or less';
        } else {
          delete this.fieldErrors[fieldName];
        }
        break;
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    return this.touchedFields.has(fieldName) && !!this.fieldErrors[fieldName];
  }

  getFieldError(fieldName: string): string {
    return this.fieldErrors[fieldName] || '';
  }

  onFieldChange(fieldName: string) {
    if (this.touchedFields.has(fieldName)) {
      this.validateField(fieldName);
    }
  }

  isFormValid(): boolean {
    // Validate required fields
    this.validateField('name');
    this.validateField('code');
    
    return !this.fieldErrors['name'] && 
           !this.fieldErrors['code'] && 
           !!this.subject.name?.trim() && 
           !!this.subject.code?.trim();
  }

  onSubmit() {
    // Mark all fields as touched
    this.touchedFields.add('name');
    this.touchedFields.add('code');
    this.touchedFields.add('description');
    
    // Validate all fields
    this.validateField('name');
    this.validateField('code');
    this.validateField('description');
    
    if (!this.isFormValid()) {
      this.error = 'Please fix the errors in the form';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    this.error = '';
    this.success = '';
    this.submitting = true;

    // Ensure code is uppercase
    const subjectData: any = {
      name: this.subject.name.trim(),
      code: this.subject.code.trim().toUpperCase(),
      description: this.subject.description?.trim() || '',
      isActive: this.subject.isActive !== false
    };

    if (this.isEdit) {
      this.subjectService.updateSubject(this.subject.id, subjectData).subscribe({
        next: () => {
          this.success = 'Subject updated successfully';
          this.submitting = false;
          setTimeout(() => this.router.navigate(['/subjects']), 1500);
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to update subject';
          this.submitting = false;
          setTimeout(() => this.error = '', 5000);
        }
      });
    } else {
      this.subjectService.createSubject(subjectData).subscribe({
        next: () => {
          this.success = 'Subject created successfully';
          this.submitting = false;
          setTimeout(() => this.router.navigate(['/subjects']), 1500);
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to create subject';
          this.submitting = false;
          setTimeout(() => this.error = '', 5000);
        }
      });
    }
  }
}
