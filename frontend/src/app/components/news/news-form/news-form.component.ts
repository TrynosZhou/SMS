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

    this.newsService.getNewsById(this.newsId).subscribe({
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
    
    // Prepare data
    const newsData: CreateNewsData | UpdateNewsData = {
      title: formValue.title.trim(),
      content: formValue.content.trim(),
      summary: formValue.summary.trim() || undefined,
      category: formValue.category,
      status: formValue.status,
      isPinned: formValue.isPinned,
      publishedAt: formValue.publishedAt ? new Date(formValue.publishedAt).toISOString() : undefined,
      expiresAt: formValue.expiresAt ? new Date(formValue.expiresAt).toISOString() : undefined,
      imageUrl: formValue.imageUrl.trim() || undefined,
      targetRoles: formValue.targetRoles.length > 0 ? formValue.targetRoles : undefined,
      attachments: formValue.attachments.length > 0 ? formValue.attachments : undefined,
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
          this.error = 'Failed to update news article';
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
          this.error = 'Failed to create news article';
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
    const selectedRoles = event.target.value;
    this.newsForm.get('targetRoles')?.setValue(selectedRoles);
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
}
