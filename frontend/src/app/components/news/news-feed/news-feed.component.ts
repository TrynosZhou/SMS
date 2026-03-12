import { Component, OnInit } from '@angular/core';
import { NewsService } from '../../../services/news.service';
import { AuthService } from '../../../services/auth.service';
import { News, NewsCategory } from '../../../types/news';

@Component({
  selector: 'app-news-feed',
  templateUrl: './news-feed.component.html',
  styleUrls: ['./news-feed.component.css']
})
export class NewsFeedComponent implements OnInit {
  pinnedNews: News[] = [];
  latestNews: News[] = [];
  loading = true;
  error = '';

  constructor(
    private newsService: NewsService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadNews();
  }

  canManageNews(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  loadNews(): void {
    this.loading = true;
    this.error = '';

    // Load pinned news and latest news in parallel
    this.newsService.getPinnedNews().subscribe({
      next: (pinned) => {
        this.pinnedNews = pinned;
        this.loadLatestNews();
      },
      error: (err) => {
        console.error('Error loading pinned news:', err);
        this.loadLatestNews(); // Still try to load latest news
      }
    });
  }

  loadLatestNews(): void {
    this.newsService.getPublishedNews({ limit: 10 }).subscribe({
      next: (response) => {
        this.latestNews = response.data.filter(news => 
          !this.pinnedNews.some(pinned => pinned.id === news.id)
        );
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load news articles';
        this.loading = false;
        console.error('Error loading latest news:', err);
      }
    });
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

  formatViewCount(count: number): string {
    return this.newsService.formatViewCount(count);
  }

  isNewsActive(news: News): boolean {
    return this.newsService.isNewsActive(news);
  }

  onNewsClick(news: News): void {
    // Increment view count when news is clicked
    this.newsService.getNewsById(news.id, true).subscribe({
      next: () => {
        // View count incremented successfully
      },
      error: (err) => {
        console.error('Error incrementing view count:', err);
      }
    });
  }

  refreshNews(): void {
    this.loadNews();
  }

  getInitials(author: any): string {
    if (!author) return '?';
    const first = (author.firstName || '').charAt(0).toUpperCase();
    const last = (author.lastName || '').charAt(0).toUpperCase();
    return first + last || '?';
  }

  getTotalViews(): number {
    const pinnedViews = this.pinnedNews.reduce((sum, n) => sum + (n.viewCount || 0), 0);
    const latestViews = this.latestNews.reduce((sum, n) => sum + (n.viewCount || 0), 0);
    return pinnedViews + latestViews;
  }

  getThisWeekCount(): number {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const allNews = [...this.pinnedNews, ...this.latestNews];
    return allNews.filter(n => {
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

  trackByNews(index: number, news: News): string {
    return news.id;
  }
}
