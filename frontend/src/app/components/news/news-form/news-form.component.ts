import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NewsService } from '../../../services/news.service';
import { News, CreateNewsData, UpdateNewsData, NewsCategory, NewsStatus } from '../../../types/news';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-news-form',
  templateUrl: './news-form.component.html',
  styleUrls: ['./news-form.component.css']
})
export class NewsFormComponent implements OnInit {
  newsForm: FormGroup;
  isEditMode = false;
  loading = false;
  saving = false;
  error = '';
  success = '';
  newsId: string | null = null;
  
  // Options
  categories = Object.values(NewsCategory);
  statuses = [NewsStatus.DRAFT, NewsStatus.PUBLISHED];
  userRoles = ['admin', 'superadmin', 'accountant', 'teacher', 'parent', 'student'];

  constructor(
    private fb: FormBuilder,
    private newsService: NewsService,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {
    this.newsForm = this.createNewsForm();
  }

  ngOnInit(): void {
    this.newsId = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!this.newsId;
    
    if (this.isEditMode && this.newsId) {
      this.loadNews();
    }
  }

  canManageNews(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  private createNewsForm(): FormGroup {
    return this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(255)]],
      content: ['', [Validators.required, Validators.minLength(10)]],
      summary: ['', [Validators.maxLength(255)]],
      category: [NewsCategory.GENERAL, Validators.required],
      status: [NewsStatus.DRAFT, Validators.required],
      isPinned: [false],
      publishedAt: [''],
      expiresAt: [''],
      imageUrl: ['', [Validators.maxLength(500)]],
      targetRoles: [[]],
      attachments: [[]],
      allowComments: [true],
      tags: ['']
    });
  }

  loadNews(): void {
    if (!this.newsId) return;

    this.loading = true;
    this.error = '';

    this.newsService.getNewsById(this.newsId, false, true).subscribe({
      next: (news: News) => {
        this.populateForm(news);
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load news article';
        this.loading = false;
        console.error('Error loading news:', err);
      }
    });
  }

  populateForm(news: News): void {
    this.newsForm.patchValue({
      title: news.title,
      content: news.content,
      summary: news.summary || '',
      category: news.category,
      status: news.status,
      isPinned: news.isPinned,
      publishedAt: news.publishedAt ? this.formatDateTimeForInput(news.publishedAt) : '',
      expiresAt: news.expiresAt ? this.formatDateTimeForInput(news.expiresAt) : '',
      imageUrl: news.imageUrl || '',
      targetRoles: news.targetRoles || [],
      attachments: news.attachments || [],
      allowComments: news.allowComments,
      tags: news.tags || ''
    });
  }

  private formatDateTimeForInput(dateString: string): string {
    const date = new Date(dateString);
    return date.toISOString().slice(0, 16);
  }

  private safeDateToISOString(dateInput: string): string | undefined {
    if (!dateInput || !dateInput.trim()) {
      return undefined;
    }
    
    const date = new Date(dateInput);
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      return undefined;
    }
    
    return date.toISOString();
  }

  private normalizeStringArray(value: any): string[] {
    if (Array.isArray(value)) {
      return value
        .map(v => String(v))
        .map(v => v.trim())
        .filter(v => v.length > 0);
    }

    if (typeof value === 'string') {
      const v = value.trim();
      return v ? [v] : [];
    }

    return [];
  }

  onSubmit(): void {
    if (this.newsForm.invalid) {
      this.markFormGroupTouched(this.newsForm);
      this.error = 'Please fill in all required fields correctly';
      return;
    }

    this.saving = true;
    this.error = '';
    this.success = '';

    const formValue = this.newsForm.value;

    const targetRoles = this.normalizeStringArray(formValue.targetRoles);
    const attachments = this.normalizeStringArray(formValue.attachments);
    
    // Prepare data
    const newsData: CreateNewsData | UpdateNewsData = {
      title: formValue.title.trim(),
      content: formValue.content.trim(),
      summary: formValue.summary.trim() || undefined,
      category: formValue.category,
      status: formValue.status,
      isPinned: formValue.isPinned,
      publishedAt: this.safeDateToISOString(formValue.publishedAt),
      expiresAt: this.safeDateToISOString(formValue.expiresAt),
      imageUrl: formValue.imageUrl.trim() || undefined,
      targetRoles: targetRoles.length > 0 ? targetRoles : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      allowComments: formValue.allowComments,
      tags: formValue.tags.trim() || undefined
    };

    if (this.isEditMode && this.newsId) {
      // Update existing news
      const updateData: UpdateNewsData = { id: this.newsId, ...newsData };
      this.newsService.updateNews(this.newsId, updateData).subscribe({
        next: () => {
          this.success = 'News article updated successfully';
          this.saving = false;
          setTimeout(() => {
            this.router.navigate(['/news']);
          }, 1500);
        },
        error: (err) => {
          this.applyServerValidationErrors(err);
          if (!this.error) this.error = 'Failed to update news article';
          this.saving = false;
          console.error('Error updating news:', err);
        }
      });
    } else {
      // Create new news
      this.newsService.createNews(newsData as CreateNewsData).subscribe({
        next: () => {
          this.success = 'News article created successfully';
          this.saving = false;
          setTimeout(() => {
            this.router.navigate(['/news']);
          }, 1500);
        },
        error: (err) => {
          this.applyServerValidationErrors(err);
          if (!this.error) this.error = 'Failed to create news article';
          this.saving = false;
          console.error('Error creating news:', err);
        }
      });
    }
  }

  onCancel(): void {
    this.router.navigate(['/news']);
  }

  onStatusChange(): void {
    const status = this.newsForm.get('status')?.value;
    const publishedAtControl = this.newsForm.get('publishedAt');
    
    if (status === NewsStatus.PUBLISHED && !publishedAtControl?.value) {
      // Auto-set published date to now if not set
      publishedAtControl?.setValue(new Date().toISOString().slice(0, 16));
    }
  }

  onTargetRolesChange(event: any): void {
    const role = String(event?.target?.value ?? '').trim();
    if (!role) return;

    const checked = !!event?.target?.checked;
    const current = this.normalizeStringArray(this.newsForm.get('targetRoles')?.value);

    const next = checked
      ? Array.from(new Set([...current, role]))
      : current.filter(r => r !== role);

    this.newsForm.get('targetRoles')?.setValue(next);
  }

  addAttachment(): void {
    const url = prompt('Enter attachment URL:');
    if (url && url.trim()) {
      const currentAttachments = this.newsForm.get('attachments')?.value || [];
      this.newsForm.get('attachments')?.setValue([...currentAttachments, url.trim()]);
    }
  }

  removeAttachment(index: number): void {
    const currentAttachments = this.newsForm.get('attachments')?.value || [];
    currentAttachments.splice(index, 1);
    this.newsForm.get('attachments')?.setValue([...currentAttachments]);
  }

  getCategoryLabel(category: NewsCategory): string {
    return this.newsService.getCategoryLabel(category);
  }

  getStatusLabel(status: NewsStatus): string {
    return this.newsService.getStatusLabel(status);
  }

  // Form validation helpers
  isFieldInvalid(fieldName: string): boolean {
    const field = this.newsForm.get(fieldName);
    return field ? field.invalid && (field.dirty || field.touched) : false;
  }

  getFieldError(fieldName: string): string {
    const field = this.newsForm.get(fieldName);
    if (field && field.errors) {
      if (field.errors['server']) return field.errors['server'];
      if (field.errors['required']) return 'This field is required';
      if (field.errors['minlength']) return `Minimum length is ${field.errors['minlength'].requiredLength} characters`;
      if (field.errors['maxlength']) return `Maximum length is ${field.errors['maxlength'].requiredLength} characters`;
    }
    return '';
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
    });
  }

  // Character counters
  getCharacterCount(fieldName: string): number {
    const value = this.newsForm.get(fieldName)?.value || '';
    return value.length;
  }

  getMaxCharacters(fieldName: string): number {
    switch (fieldName) {
      case 'title': return 255;
      case 'summary': return 500;
      case 'imageUrl': return 500;
      default: return Infinity;
    }
  }

  private applyServerValidationErrors(err: any): void {
    const status = err?.status;
    const body = err?.error;
    if (status === 400 && body) {
      const serverMessage = body.message || 'Validation failed';
      const errors = body.errors;
      if (Array.isArray(errors)) {
        // Backend returns string[] like "title is required"
        const knownFields = ['title','content','summary','category','status','isPinned','publishedAt','expiresAt','imageUrl','targetRoles','attachments','allowComments','tags'];
        let firstMsg = '';
        errors.forEach((e: string) => {
          const msg = String(e || '').trim();
          if (!msg) return;
          if (!firstMsg) firstMsg = msg;
          // try to extract field name before first space or word followed by space
          const match = msg.match(/^([a-zA-Z]+)\b/);
          const field = match ? match[1] : '';
          const normalized = field ? field.charAt(0).toLowerCase() + field.slice(1) : '';
          const target = knownFields.includes(normalized) ? normalized : '';
          if (target) {
            const ctrl = this.newsForm.get(target);
            if (ctrl) {
              ctrl.setErrors({ ...(ctrl.errors || {}), server: msg });
              ctrl.markAsTouched();
            }
          }
        });
        this.error = firstMsg || serverMessage;
      } else if (errors && typeof errors === 'object') {
        Object.keys(errors).forEach((key) => {
          const ctrl = this.newsForm.get(key);
          const val = errors[key];
          const msg = Array.isArray(val) ? (val[0] || serverMessage) : (val || serverMessage);
          if (ctrl) {
            ctrl.setErrors({ ...(ctrl.errors || {}), server: msg });
            ctrl.markAsTouched();
          }
        });
        const firstKey = Object.keys(errors)[0];
        const firstVal = errors[firstKey];
        const firstMsg = Array.isArray(firstVal) ? (firstVal[0] || serverMessage) : (firstVal || serverMessage);
        this.error = firstMsg || serverMessage;
      } else {
        this.error = serverMessage;
      }
    }
  }
}
