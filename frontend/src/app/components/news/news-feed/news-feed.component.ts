import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, takeUntil, timeout } from 'rxjs/operators';
import { NewsService } from '../../../services/news.service';
import { AuthService } from '../../../services/auth.service';
import { News, NewsCategory } from '../../../types/news';

export type NewsFeedSort = 'newest' | 'oldest' | 'popular';
export type NewsFeedView = 'grid' | 'list';

@Component({
  standalone: false,
  selector: 'app-news-feed',
  templateUrl: './news-feed.component.html',
  styleUrls: ['./news-feed.component.css'],
})
export class NewsFeedComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly searchChange$ = new Subject<string>();
  private readonly requestTimeoutMs = 30000;

  pinnedNews: News[] = [];
  latestNews: News[] = [];
  loading = true;
  error = '';
  lastRefreshedAt: Date | null = null;

  searchQuery = '';
  selectedCategory: NewsCategory | 'all' = 'all';
  sortBy: NewsFeedSort = 'newest';
  viewMode: NewsFeedView = 'list';

  readonly categoryOptions: Array<{ value: NewsCategory | 'all'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: NewsCategory.GENERAL, label: 'General' },
    { value: NewsCategory.ACADEMIC, label: 'Academic' },
    { value: NewsCategory.EVENTS, label: 'Events' },
    { value: NewsCategory.SPORTS, label: 'Sports' },
    { value: NewsCategory.ANNOUNCEMENT, label: 'Announcements' },
    { value: NewsCategory.EXAMINATION, label: 'Examinations' },
    { value: NewsCategory.ADMISSION, label: 'Admissions' },
    { value: NewsCategory.HOLIDAY, label: 'Holidays' },
    { value: NewsCategory.STAFF, label: 'Staff' },
    { value: NewsCategory.FACILITY, label: 'Facilities' },
  ];

  constructor(
    private newsService: NewsService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.searchChange$
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.loadNews());

    this.loadNews();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get allArticles(): News[] {
    const ids = new Set<string>();
    const merged: News[] = [];
    for (const n of [...this.pinnedNews, ...this.latestNews]) {
      if (!ids.has(n.id)) {
        ids.add(n.id);
        merged.push(n);
      }
    }
    return merged;
  }

  get filteredPinned(): News[] {
    return this.applyFilters(this.pinnedNews);
  }

  get filteredLatest(): News[] {
    const pinnedIds = new Set(this.filteredPinned.map((n) => n.id));
    return this.applyFilters(this.latestNews).filter((n) => !pinnedIds.has(n.id));
  }

  get featuredArticle(): News | null {
    const pinned = this.filteredPinned;
    if (pinned.length) return pinned[0];
    const latest = this.filteredLatest;
    return latest.length ? latest[0] : null;
  }

  get displayPinned(): News[] {
    const featured = this.featuredArticle;
    if (!featured) return this.filteredPinned;
    return this.filteredPinned.filter((n) => n.id !== featured.id);
  }

  get displayLatest(): News[] {
    const featured = this.featuredArticle;
    if (!featured) return this.filteredLatest;
    return this.filteredLatest.filter((n) => n.id !== featured.id);
  }

  get hasActiveFilters(): boolean {
    return !!this.searchQuery.trim() || this.selectedCategory !== 'all';
  }

  get resultsCount(): number {
    return this.filteredPinned.length + this.displayLatest.length + (this.featuredArticle ? 1 : 0);
  }

  canManageNews(): boolean {
    return this.authService.isAdmin();
  }

  onSearchInput(): void {
    this.searchChange$.next(this.searchQuery.trim());
  }

  onCategoryChange(category: NewsCategory | 'all'): void {
    this.selectedCategory = category;
    this.loadNews();
  }

  onSortChange(sort: NewsFeedSort): void {
    this.sortBy = sort;
    this.cdr.markForCheck();
  }

  setViewMode(mode: NewsFeedView): void {
    this.viewMode = mode;
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedCategory = 'all';
    this.sortBy = 'newest';
    this.loadNews();
  }

  loadNews(): void {
    this.loading = true;
    this.error = '';

    const options: { limit: number; search?: string; category?: NewsCategory } = { limit: 40 };
    const q = this.searchQuery.trim();
    if (q) options.search = q;
    if (this.selectedCategory !== 'all') options.category = this.selectedCategory;

    forkJoin({
      pinned: this.newsService.getPinnedNews().pipe(
        timeout(this.requestTimeoutMs),
        catchError((err) => {
          console.error('Error loading pinned news:', err);
          return of([] as News[]);
        })
      ),
      latest: this.newsService.getPublishedNews(options).pipe(
        timeout(this.requestTimeoutMs),
        catchError((err) => {
          console.error('Error loading latest news:', err);
          return of({ data: [] as News[], pagination: null });
        })
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
        next: ({ pinned, latest }) => {
          this.pinnedNews = Array.isArray(pinned) ? pinned : [];
          const latestItems = Array.isArray(latest?.data) ? latest.data : [];
          const pinnedIds = new Set(this.pinnedNews.map((n) => n.id));
          this.latestNews = latestItems.filter((news) => !pinnedIds.has(news.id));
          this.error = '';
        },
        error: (err) => {
          console.error('Error loading news feed:', err);
          this.error =
            err?.name === 'TimeoutError'
              ? 'Request timed out while loading news. Check that the backend is running, then try again.'
              : 'Failed to load news articles';
          this.pinnedNews = [];
          this.latestNews = [];
        },
      });
  }

  private applyFilters(items: News[]): News[] {
    let list = [...items];

    if (this.selectedCategory !== 'all') {
      list = list.filter((n) => n.category === this.selectedCategory);
    }

    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (n) =>
          n.title?.toLowerCase().includes(q) ||
          n.summary?.toLowerCase().includes(q) ||
          n.content?.toLowerCase().includes(q) ||
          n.tags?.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (this.sortBy === 'popular') {
        return (b.viewCount || 0) - (a.viewCount || 0);
      }
      const da = new Date(a.publishedAt || a.createdAt).getTime();
      const db = new Date(b.publishedAt || b.createdAt).getTime();
      return this.sortBy === 'oldest' ? da - db : db - da;
    });

    return list;
  }

  openArticle(news: News, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.newsService.getNewsById(news.id, true).subscribe({
      error: (err) => console.error('Error incrementing view count:', err),
    });
    this.router.navigate(['/news', news.id]);
  }

  refreshNews(): void {
    this.loadNews();
  }

  getCategoryLabel(category: NewsCategory): string {
    return this.newsService.getCategoryLabel(category);
  }

  getCategoryColor(category: NewsCategory): string {
    return this.newsService.getCategoryColor(category);
  }

  formatDate(dateString?: string): string {
    return this.newsService.formatDate(dateString);
  }

  formatRelativeTime(dateString?: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatViewCount(count: number): string {
    return this.newsService.formatViewCount(count);
  }

  getReadingTime(news: News): string {
    const text = `${news.title || ''} ${news.summary || ''} ${news.content || ''}`;
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const mins = Math.max(1, Math.ceil(words / 200));
    return `${mins} min read`;
  }

  getExcerpt(news: News, max = 140): string {
    const raw = (news.summary || news.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (raw.length <= max) return raw;
    return raw.slice(0, max).trim() + '…';
  }

  getTags(news: News): string[] {
    if (!news.tags?.trim()) return [];
    return news.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  getImageUrl(news: News): string | null {
    const raw = news.imageUrl?.trim();
    if (!raw) return null;
    if (/^(https?:)?\/\//i.test(raw) || /^data:/i.test(raw)) return raw;
    const path = raw
      .replace(/^\/api\/uploads\//i, '/uploads/')
      .replace(/^api\/uploads\//i, '/uploads/');
    return path.startsWith('/') ? path : `/${path}`;
  }

  getInitials(author: any): string {
    if (!author) return '?';
    const first = (author.firstName || '').charAt(0).toUpperCase();
    const last = (author.lastName || '').charAt(0).toUpperCase();
    return (first + last).trim() || '?';
  }

  authorDisplayName(author: any): string {
    if (!author) return 'School';
    const name = [author.firstName, author.lastName].filter(Boolean).join(' ').trim();
    return name || 'School';
  }

  getTotalViews(): number {
    return this.allArticles.reduce((sum, n) => sum + (n.viewCount || 0), 0);
  }

  getThisWeekCount(): number {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return this.allArticles.filter((n) => {
      const publishDate = new Date(n.publishedAt || n.createdAt);
      return publishDate >= oneWeekAgo;
    }).length;
  }

  isNewArticle(news: News): boolean {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const publishDate = new Date(news.publishedAt || news.createdAt);
    return publishDate >= threeDaysAgo;
  }

  isExpiringSoon(news: News): boolean {
    if (!news.expiresAt) return false;
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const expiryDate = new Date(news.expiresAt);
    return expiryDate <= threeDaysFromNow && expiryDate > new Date();
  }

  trackByNews(_index: number, news: News): string {
    return news.id;
  }
}
