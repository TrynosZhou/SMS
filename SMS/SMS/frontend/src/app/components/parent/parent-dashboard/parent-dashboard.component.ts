import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ParentService } from '../../../services/parent.service';
import { AuthService } from '../../../services/auth.service';
import { ExamService } from '../../../services/exam.service';
import { SettingsService } from '../../../services/settings.service';
import { FinanceService } from '../../../services/finance.service';
import { NewsService } from '../../../services/news.service';
import { News } from '../../../types/news';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-parent-dashboard',
  templateUrl: './parent-dashboard.component.html',
  styleUrls: ['./parent-dashboard.component.css']
})
export class ParentDashboardComponent implements OnInit, OnDestroy {
  students: any[] = [];
  loading = false;
  error = '';
  currencySymbol = 'KES';
  parentName = '';
  invoiceLoading = false;
  schoolLogo: string | null = null;
  schoolLogo2: string | null = null;

  newsLoading = false;
  newsError = '';
  featuredNews: News | null = null;
  latestNews: News[] = [];

  carouselImages: string[] = [];
  carouselIndex = 0;
  carouselAnimating = true;
  private carouselTimerId: number | null = null;
  private carouselIntervalMs = 5000;

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
    private examService: ExamService,
    private settingsService: SettingsService,
    private financeService: FinanceService,
    private newsService: NewsService,
    private router: Router
  ) {
    const user = this.authService.getCurrentUser();
    if (user?.parent) {
      this.parentName = `${user.parent.firstName || ''} ${user.parent.lastName || ''}`.trim()
        || user.fullName?.trim()
        || 'Parent';
    } else {
      this.parentName = user?.fullName?.trim() || 'Parent';
    }
  }

  ngOnInit() {
    this.loadSettings();
    this.loadStudents();
    this.loadNews();
  }

  ngOnDestroy() {
    this.stopCarousel();
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

    this.newsService.getPublishedNews({ limit: 6 }).subscribe({
      next: (response) => {
        const items = response?.data || [];
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

        this.newsLoading = false;
      },
      error: (err: any) => {
        console.error('Error loading news:', err);
        this.newsError = 'Failed to load news & updates.';
        this.carouselImages = [];
        this.carouselIndex = 0;
        this.stopCarousel();
        this.newsLoading = false;
      }
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

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.currencySymbol = data.currencySymbol || 'KES';
        this.schoolLogo = data.schoolLogo || null;
        this.schoolLogo2 = data.schoolLogo2 || null;
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
      }
    });
  }

  loadStudents() {
    this.loading = true;
    this.error = '';
    
    this.parentService.getLinkedStudents().subscribe({
      next: (response: any) => {
        this.students = response.students || [];
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
          setTimeout(() => {
            this.authService.logout();
          }, 2000);
        } else {
          this.error = err.error?.message || 'Failed to load students';
        }
        setTimeout(() => this.error = '', 5000);
      }
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

    // Navigate to report card page with student ID
    this.router.navigate(['/report-cards'], {
      queryParams: { studentId: student.id }
    });
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

  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  get greetingWithName(): string {
    const name = this.parentName && this.parentName !== 'Parent' ? this.parentName : '';
    return name ? `${this.greeting}, ${name}` : this.greeting;
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
