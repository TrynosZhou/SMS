import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil, timeout } from 'rxjs/operators';
import { ParentService } from '../../../services/parent.service';
import { AuthService } from '../../../services/auth.service';
import { SettingsService } from '../../../services/settings.service';
import { FinanceService } from '../../../services/finance.service';
import { NewsService } from '../../../services/news.service';
import { MessageService } from '../../../services/message.service';
import { News } from '../../../types/news';
import { environment } from '../../../../environments/environment';

@Component({
  standalone: false,  selector: 'app-parent-dashboard',
templateUrl: './parent-dashboard.component.html',
  styleUrls: ['./parent-dashboard.component.css']
})
export class ParentDashboardComponent implements OnInit, OnDestroy {
  students: any[] = [];
  loading = false;
  error = '';
  currencySymbol = 'KES';
  parentName = '';
  parentGender = '';
  invoiceLoading = false;
  schoolLogo: string | null = null;
  schoolLogo2: string | null = null;

  newsLoading = false;
  newsError = '';
  featuredNews: News | null = null;
  latestNews: News[] = [];

  recentMessages: any[] = [];
  unreadMessageCount = 0;
  lastRefreshedAt: Date | null = null;

  readonly quickLinks = [
    { route: '/parent/inbox', icon: '📧', label: 'Inbox', pastel: 'sky' },
    { route: '/parent/send-message', icon: '✉️', label: 'Send message', pastel: 'violet' },
    { route: '/parent/invoice-statement', icon: '🧾', label: 'Invoice', pastel: 'rose' },
    { route: '/parent/student-portal', icon: '🎓', label: 'Student portal', pastel: 'emerald' },
    { route: '/parent/link-students', icon: '🔗', label: 'Link students', pastel: 'amber' },
    { route: '/parent/manage-account', icon: '👤', label: 'My account', pastel: 'slate' },
  ];

  carouselImages: string[] = [];
  carouselIndex = 0;
  carouselAnimating = true;
  private carouselTimerId: number | null = null;
  private carouselIntervalMs = 5000;
  private readonly destroy$ = new Subject<void>();
  private readonly requestTimeoutMs = 60000;

  private readonly backendBaseUrl = (() => {
    const apiUrl = String(environment.apiUrl || '').trim();
    // In development apiUrl is "/api" and Angular dev-server proxies it.
    // For images we want to keep "/uploads/..." as-is (also proxied), so no absolute base.
    if (!apiUrl || apiUrl.startsWith('/')) return '';
    return apiUrl.replace(/\/+$/, '').replace(/\/api\/?$/, '');
  })();

  constructor(
    private parentService: ParentService,
    private authService: AuthService,
    private settingsService: SettingsService,
    private financeService: FinanceService,
    private newsService: NewsService,
    private messageService: MessageService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.loadParentName();
  }

  private loadParentName() {
    // First, set from local user data as fallback
    const user = this.authService.getCurrentUser();
    if (user?.parent) {
      const lastName = (user.parent.lastName || '').trim();
      const firstName = (user.parent.firstName || '').trim();
      this.parentName = `${lastName} ${firstName}`.trim() || user.fullName?.trim() || 'Parent';
      this.parentGender = (user.parent.gender || '').trim();
    } else {
      this.parentName = user?.fullName?.trim() || 'Parent';
      this.parentGender = '';
    }
  }

  ngOnInit() {
    this.bootstrapDashboard();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopCarousel();
  }

  private bootstrapDashboard() {
    this.loading = true;
    this.error = '';

    forkJoin({
      settings: this.settingsService.getSettings().pipe(
        timeout(this.requestTimeoutMs),
        catchError(() => of({}))
      ),
      students: this.parentService.getLinkedStudents().pipe(
        timeout(this.requestTimeoutMs),
        catchError((err: any) => {
          const msg =
            err?.name === 'TimeoutError'
              ? 'Request timed out while loading students. Please refresh the page.'
              : err?.error?.message || err?.message || 'Failed to load students';
          this.error = msg;
          if (err?.status === 401) {
            setTimeout(() => this.authService.logout(), 2000);
          }
          return of({ students: [] });
        })
      ),
      profile: this.parentService.getCurrentProfile().pipe(
        timeout(this.requestTimeoutMs),
        catchError(() => of(null))
      ),
      messages: this.messageService.getParentMessages().pipe(
        timeout(this.requestTimeoutMs),
        catchError(() => of({ messages: [] }))
      ),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.lastRefreshedAt = new Date();
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: ({ settings, students, profile, messages }) => {
          this.currencySymbol = settings?.currencySymbol || 'KES';
          this.schoolLogo = settings?.schoolLogo || null;
          this.schoolLogo2 = settings?.schoolLogo2 || null;

          this.students = students?.students || [];

          const msgs = messages?.messages || [];
          this.unreadMessageCount = msgs.filter((m: any) => !m.isRead).length;
          this.recentMessages = msgs.slice(0, 4);

          if (profile) {
            const lastName = (profile.lastName || '').trim();
            const firstName = (profile.firstName || '').trim();
            this.parentName = `${lastName} ${firstName}`.trim() || profile.fullName || 'Parent';
            this.parentGender = (profile.gender || '').trim();
          } else {
            this.loadParentName();
          }

          this.cdr.markForCheck();
        },
      });
  }

  private applyNews(items: News[]) {
    this.featuredNews = items.length > 0 ? items[0] : null;
    this.latestNews = items.length > 1 ? items.slice(1, 6) : [];

    const urls = items
      .map((n: any) => String(n?.imageUrl || '').trim())
      .filter((u: string) => !!u);
    const normalized = urls
      .map((u: string) => this.normalizeImageUrl(u))
      .filter((u: string) => !!u);
    this.carouselImages = Array.from(new Set(normalized));
    this.carouselIndex = 0;
    this.carouselAnimating = true;
    this.startCarousel();
  }

  private stopCarousel() {
    if (this.carouselTimerId !== null) {
      window.clearInterval(this.carouselTimerId);
      this.carouselTimerId = null;
    }
  }

  private startCarousel() {
    this.stopCarousel();
    if (!this.carouselImages || this.carouselImages.length <= 1) {
      return;
    }
    this.carouselTimerId = window.setInterval(() => {
      this.nextCarouselImage();
    }, this.carouselIntervalMs);
  }

  nextCarouselImage() {
    if (!this.carouselImages || this.carouselImages.length <= 1) return;
    this.carouselAnimating = false;
    window.setTimeout(() => {
      this.carouselIndex = (this.carouselIndex + 1) % this.carouselImages.length;
      this.carouselAnimating = true;
    }, 20);
  }

  prevCarouselImage() {
    if (!this.carouselImages || this.carouselImages.length <= 1) return;
    this.carouselAnimating = false;
    window.setTimeout(() => {
      this.carouselIndex = (this.carouselIndex - 1 + this.carouselImages.length) % this.carouselImages.length;
      this.carouselAnimating = true;
    }, 20);
  }

  loadNews() {
    this.newsLoading = true;
    this.newsError = '';

    this.newsService
      .getPublishedNews({ limit: 6 })
      .pipe(
        timeout(this.requestTimeoutMs),
        takeUntil(this.destroy$),
        finalize(() => {
          this.newsLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response) => {
          this.applyNews(response?.data || []);
        },
        error: (err: any) => {
          console.error('Error loading news:', err);
          this.newsError = 'Failed to load news & updates.';
          this.carouselImages = [];
          this.carouselIndex = 0;
          this.stopCarousel();
        },
      });
  }

  normalizeImageUrl(url?: string | null): string {
    const raw = String(url || '').trim();
    if (!raw) return '';
    if (/^(https?:)?\/\//i.test(raw)) return raw;
    if (/^data:/i.test(raw)) return raw;

    // Some records may store uploads behind the API prefix; static files are served at /uploads.
    // Normalize to the correct public static path.
    const normalizedPath = raw
      .replace(/^\/api\/uploads\//i, '/uploads/')
      .replace(/^api\/uploads\//i, '/uploads/');

    const base = this.backendBaseUrl;
    if (!base) return normalizedPath;

    if (normalizedPath.startsWith('/')) return `${base}${normalizedPath}`;
    return `${base}/${normalizedPath}`;
  }

  openNews(news: News) {
    this.router.navigate(['/news', news.id]);
  }

  formatNewsDate(dateString?: string): string {
    return this.newsService.formatDate(dateString);
  }

  getNewsExcerpt(news: News, maxLen: number): string {
    const text = (news.summary || news.content || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
  }

  refreshDashboard(): void {
    this.bootstrapDashboard();
  }

  formatRefreshedAt(): string {
    if (!this.lastRefreshedAt) return '';
    return this.lastRefreshedAt.toLocaleString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatMessageDate(dateString?: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  get feesClearedPercent(): number {
    if (!this.students.length) return 0;
    return Math.round((this.studentsCleared / this.students.length) * 100);
  }

  openStudentPortal(student: any): void {
    if (!student?.id) return;
    this.authService.enterStudentPortal(student);
    this.router.navigate(['/dashboard']);
  }

  openInvoiceStatement(student: any): void {
    if (!student?.id) return;
    this.router.navigate(['/parent/invoice-statement'], {
      queryParams: { studentId: student.id },
    });
  }

  loadStudents() {
    this.loading = true;
    this.error = '';

    this.parentService
      .getLinkedStudents()
      .pipe(
        timeout(this.requestTimeoutMs),
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response: any) => {
          this.students = response?.students || [];
        },
        error: (err: any) => {
          if (err?.status === 401) {
            this.error = 'Authentication required. Please log in again.';
            setTimeout(() => this.authService.logout(), 2000);
          } else {
            this.error =
              err?.name === 'TimeoutError'
                ? 'Request timed out while loading students.'
                : err?.error?.message || 'Failed to load students';
          }
          setTimeout(() => (this.error = ''), 8000);
        },
      });
  }

  viewReportCard(student: any) {
    // Only fees (tuition) balance affects report card access; uniform balance does not.
    const termBalance = parseFloat(String(student.termBalance || 0));

    if (termBalance > 0) {
      this.error = `Report card access is restricted. Please clear the outstanding fees (tuition) balance of ${this.currencySymbol} ${termBalance.toFixed(2)} to view the report card.`;
      setTimeout(() => this.error = '', 8000);
      return;
    }

    this.router.navigate(['/report-cards'], { queryParams: { studentId: student.id } });
  }

  unlinkStudent(studentId: string) {
    if (!confirm('Are you sure you want to unlink this student?')) {
      return;
    }

    this.parentService.unlinkStudent(studentId).subscribe({
      next: () => {
        this.loadStudents();
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to unlink student';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  linkMoreStudents() {
    this.router.navigate(['/parent/link-students']);
  }

  logout() {
    this.authService.logout();
  }

  manageAccount() {
    this.router.navigate(['/parent/manage-account']);
  }

  canChangeOwnPassword(): boolean {
    return this.authService.canChangeOwnPassword();
  }

  get changePasswordRoute(): string {
    return this.authService.getChangePasswordRoute();
  }

  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  get honorific(): string {
    if (this.parentGender?.toLowerCase() === 'male') return 'Mr';
    if (this.parentGender?.toLowerCase() === 'female') return 'Mrs';
    return '';
  }

  get greetingWithName(): string {
    const name = this.parentName && this.parentName !== 'Parent' ? this.parentName : '';
    if (!name) return this.greeting;
    
    // Include honorific (Mr/Mrs) based on gender
    const title = this.honorific;
    const fullGreeting = title ? `${this.greeting}, ${title} ${name}` : `${this.greeting}, ${name}`;
    return fullGreeting;
  }

  get todayDate(): string {
    return new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  get totalOutstanding(): number {
    return this.students.reduce((sum, s) => sum + Math.max(0, parseFloat(String(s.currentInvoiceBalance || 0))), 0);
  }

  get studentsWithBalance(): number {
    return this.students.filter(s => parseFloat(String(s.termBalance || 0)) > 0).length;
  }

  get studentsCleared(): number {
    return this.students.filter(s => parseFloat(String(s.termBalance || 0)) <= 0).length;
  }

  studentInitials(student: any): string {
    const f = (student.firstName || '').charAt(0).toUpperCase();
    const l = (student.lastName || '').charAt(0).toUpperCase();
    return f + l || '?';
  }

  getFirstStudent(): any {
    return this.students.length > 0 ? this.students[0] : null;
  }

  viewReportCardForFirstStudent() {
    const firstStudent = this.getFirstStudent();
    if (firstStudent) {
      this.viewReportCard(firstStudent);
    }
  }

  private fetchLatestInvoicePdf(action: 'preview' | 'download') {
    if (this.students.length === 0) {
      this.error = 'No linked students found. Please link a student first.';
      setTimeout(() => this.error = '', 5000);
      return;
    }
    const firstStudent = this.students[0];
    this.invoiceLoading = true;
    this.error = '';

    this.financeService.getInvoices(firstStudent.id).subscribe({
      next: (invoices: any[]) => {
        if (invoices.length === 0) {
          this.invoiceLoading = false;
          this.error = 'No invoices found for this student.';
          setTimeout(() => this.error = '', 5000);
          return;
        }
        const latestInvoice = invoices.sort((a: any, b: any) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        })[0];

        this.financeService.getInvoicePDF(latestInvoice.id).subscribe({
          next: (result: { blob: Blob; filename: string }) => {
            this.invoiceLoading = false;
            const url = window.URL.createObjectURL(result.blob);
            if (action === 'preview') {
              window.open(url, '_blank', 'noopener,noreferrer');
              setTimeout(() => window.URL.revokeObjectURL(url), 60000);
            } else {
              const link = document.createElement('a');
              link.href = url;
              link.download = result.filename;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              setTimeout(() => window.URL.revokeObjectURL(url), 100);
            }
          },
          error: (err: any) => {
            this.invoiceLoading = false;
            console.error('Error loading invoice PDF:', err);
            this.error = err.error?.message || 'Failed to load invoice PDF';
            setTimeout(() => this.error = '', 5000);
          }
        });
      },
      error: (err: any) => {
        this.invoiceLoading = false;
        console.error('Error fetching invoices:', err);
        this.error = err.error?.message || 'Failed to fetch invoices';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  previewCurrentInvoice() {
    this.fetchLatestInvoicePdf('preview');
  }

  downloadCurrentInvoice() {
    this.fetchLatestInvoicePdf('download');
  }
}
