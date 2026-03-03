import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NewsService } from '../../../services/news.service';
import { News, NewsCategory } from '../../../types/news';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-news-detail',
  templateUrl: './news-detail.component.html',
  styleUrls: ['./news-detail.component.css']
})
export class NewsDetailComponent implements OnInit {
  news: News | null = null;
  loading = true;
  error = '';

  private readonly backendBaseUrl = (() => {
    const apiUrl = String(environment.apiUrl || '').trim();
    if (!apiUrl || apiUrl.startsWith('/')) return '';
    return apiUrl.replace(/\/+$/, '').replace(/\/api\/?$/, '');
  })();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private newsService: NewsService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadNews();
  }

  normalizeImageUrl(url?: string | null): string {
    const raw = String(url || '').trim();
    if (!raw) return '';
    if (/^(https?:)?\/\//i.test(raw)) return raw;
    if (/^data:/i.test(raw)) return raw;

    const normalizedPath = raw
      .replace(/^\/api\/uploads\//i, '/uploads/')
      .replace(/^api\/uploads\//i, '/uploads/');

    const base = this.backendBaseUrl;
    if (!base) return normalizedPath;
    if (normalizedPath.startsWith('/')) return `${base}${normalizedPath}`;
    return `${base}/${normalizedPath}`;
  }

  canManageNews(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  loadNews(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error = 'News article not found';
      this.loading = false;
      return;
    }

    this.loading = true;
    this.error = '';

    // Load news with view count increment
    this.newsService.getNewsById(id, true, this.canManageNews()).subscribe({
      next: (news: News) => {
        this.news = news;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load news article';
        this.loading = false;
        console.error('Error loading news:', err);
      }
    });
  }

  getCategoryLabel(category: NewsCategory): string {
    return this.newsService.getCategoryLabel(category);
  }

  getCategoryColor(category: NewsCategory): string {
    return this.newsService.getCategoryColor(category);
  }

  getStatusLabel(status: string): string {
    return this.newsService.getStatusLabel(status);
  }

  getStatusColor(status: string): string {
    return this.newsService.getStatusColor(status);
  }

  formatDate(dateString?: string): string {
    return this.newsService.formatDate(dateString);
  }

  formatViewCount(count: number): string {
    return this.newsService.formatViewCount(count);
  }

  isNewsActive(): boolean {
    return this.news ? this.newsService.isNewsActive(this.news) : false;
  }

  editNews(): void {
    if (this.news) {
      this.router.navigate(['/news/edit', this.news.id]);
    }
  }

  deleteNews(): void {
    if (this.news && confirm('Are you sure you want to delete this news article?')) {
      this.newsService.deleteNews(this.news.id).subscribe({
        next: () => {
          this.router.navigate(['/news']);
        },
        error: (err) => {
          this.error = 'Failed to delete news article';
          console.error('Error deleting news:', err);
        }
      });
    }
  }

  goBack(): void {
    this.router.navigate(['/news']);
  }

  shareNews(): void {
    if (this.news) {
      const url = window.location.href;
      if (navigator.share) {
        navigator.share({
          title: this.news.title,
          text: this.news.summary || this.news.content.substring(0, 200),
          url: url
        }).catch(err => console.log('Error sharing:', err));
      } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(url).then(() => {
          alert('News link copied to clipboard!');
        }).catch(err => console.error('Error copying link:', err));
      }
    }
  }

  printNews(): void {
    window.print();
  }

  getTagsArray(): string[] {
    if (!this.news?.tags) return [];
    return this.news.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
  }

  getFileName(url: string): string {
    return url.split('/').pop() || url;
  }
}
