import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { SubjectService } from '../../../services/subject.service';
import { activatePageLoad } from '../../../utils/route-activation';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  standalone: false,
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
export class SubjectFormComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private editId: string | null = null;

  subject: any = {
    name: '',
    code: '',
    description: '',
    isActive: true
  };
  isEdit = false;
  error = '';
  success = '';
  loadError = '';
  submitting = false;
  loadingSubject = false;

  readonly skeletonSlots = [1, 2, 3, 4, 5];
  readonly codeSuggestions = ['MATH', 'ENG', 'SCI', 'BIO', 'CHEM', 'PHY', 'HIST', 'GEO', 'ICT', 'AGR'];

  fieldErrors: Record<string, string> = {};
  touchedFields = new Set<string>();

  constructor(
    private subjectService: SubjectService,
    private route: ActivatedRoute,
    public router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  get pageTitle(): string {
    return this.isEdit ? 'Edit subject' : 'Create new subject';
  }

  get formCompletion(): number {
    let score = 0;
    if (this.subject.name?.trim()) score += 50;
    if (this.subject.code?.trim() && !this.fieldErrors['code']) score += 40;
    if (this.subject.description?.trim()) score += 10;
    return Math.min(100, score);
  }

  get formStats(): { completion: number } {
    return { completion: this.formCompletion };
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const id = params.get('id');
      this.editId = id;
      this.isEdit = !!id;
      if (id) {
        this.loadSubject(id);
      } else {
        this.loadingSubject = false;
        this.subject = { name: '', code: '', description: '', isActive: true };
        this.cdr.markForCheck();
      }
    });

    activatePageLoad(this.router, this.destroy$, '/subjects/', () => {
      const id = this.route.snapshot.params['id'];
      if (id && this.isEdit) {
        this.loadSubject(id);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  clearAlert(type: 'success' | 'error' | 'load'): void {
    if (type === 'success') this.success = '';
    if (type === 'error') this.error = '';
    if (type === 'load') this.loadError = '';
    this.cdr.markForCheck();
  }

  retryLoad(): void {
    if (this.editId) {
      this.loadSubject(this.editId);
    }
  }

  loadSubject(id: string): void {
    this.loadingSubject = true;
    this.loadError = '';
    this.cdr.markForCheck();

    this.subjectService
      .getSubjectById(id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingSubject = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data: any) => {
          this.subject = { ...data, isActive: data.isActive !== false };
          if (this.subject.code) {
            this.subject.code = String(this.subject.code).toUpperCase();
          }
        },
        error: () => {
          this.loadError = 'Failed to load subject. Check your connection and try again.';
        }
      });
  }

  applyCodeSuggestion(code: string): void {
    this.subject.code = code;
    this.touchedFields.add('code');
    this.validateField('code');
    this.cdr.markForCheck();
  }

  onCodeChange(): void {
    if (this.subject.code) {
      this.subject.code = this.subject.code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    if (this.touchedFields.has('code')) {
      this.validateField('code');
    }
    this.cdr.markForCheck();
  }

  validateField(fieldName: string): void {
    this.touchedFields.add(fieldName);
    const value = this.subject[fieldName];

    switch (fieldName) {
      case 'name':
        if (!value || String(value).trim() === '') {
          this.fieldErrors[fieldName] = 'Subject name is required';
        } else if (String(value).length > 100) {
          this.fieldErrors[fieldName] = 'Subject name must be 100 characters or less';
        } else {
          delete this.fieldErrors[fieldName];
        }
        break;
      case 'code':
        if (!value || String(value).trim() === '') {
          this.fieldErrors[fieldName] = 'Subject code is required';
        } else if (String(value).length > 20) {
          this.fieldErrors[fieldName] = 'Subject code must be 20 characters or less';
        } else if (!/^[A-Z0-9]+$/.test(String(value))) {
          this.fieldErrors[fieldName] = 'Use uppercase letters and numbers only';
        } else if (String(value).length < 2) {
          this.fieldErrors[fieldName] = 'Subject code must be at least 2 characters';
        } else {
          delete this.fieldErrors[fieldName];
        }
        break;
      case 'description':
        if (value && String(value).length > 500) {
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

  onFieldChange(fieldName: string): void {
    if (this.touchedFields.has(fieldName)) {
      this.validateField(fieldName);
    }
    this.cdr.markForCheck();
  }

  isFormValid(): boolean {
    return (
      !this.fieldErrors['name'] &&
      !this.fieldErrors['code'] &&
      !!this.subject.name?.trim() &&
      !!this.subject.code?.trim() &&
      /^[A-Z0-9]{2,20}$/.test(String(this.subject.code || ''))
    );
  }

  onSubmit(): void {
    this.touchedFields.add('name');
    this.touchedFields.add('code');
    this.touchedFields.add('description');
    this.validateField('name');
    this.validateField('code');
    this.validateField('description');

    if (!this.isFormValid()) {
      this.error = 'Please fix the errors in the form before saving.';
      this.cdr.markForCheck();
      return;
    }

    this.error = '';
    this.success = '';
    this.submitting = true;
    this.cdr.markForCheck();

    const subjectData: any = {
      name: this.subject.name.trim(),
      code: this.subject.code.trim().toUpperCase(),
      description: this.subject.description?.trim() || '',
      isActive: this.subject.isActive !== false
    };

    const request$ = this.isEdit
      ? this.subjectService.updateSubject(this.subject.id, subjectData)
      : this.subjectService.createSubject(subjectData);

    request$
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.submitting = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.success = this.isEdit ? 'Subject updated successfully' : 'Subject created successfully';
          setTimeout(() => this.router.navigate(['/subjects']), 1200);
        },
        error: (err: any) => {
          this.error = err.error?.message || (this.isEdit ? 'Failed to update subject' : 'Failed to create subject');
        }
      });
  }
}
