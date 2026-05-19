import { Component, OnInit } from '@angular/core';
import { NewsService } from '../../../services/news.service';
import { News, NewsQueryOptions, NewsCategory, NewsStatus } from '../../../types/news';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-news-list',
  templateUrl: './news-list.component.html',
  styleUrls: ['./news-list.component.css']
})
export class NewsListComponent implements OnInit {
  newsList: News[] = [];
  loading = false;
  error = '';
  success = '';
  
  // Statistics
  pinnedCount = 0;
  publishedCount = 0;
  totalViews = 0;
  // Pagination
  currentPage = 1;
  pageSize = 10;
  totalItems = 0;
  totalPages = 0;
  
  // Filters
  selectedCategory: NewsCategory | '' = '';
  selectedStatus: NewsStatus | '' = '';
  selectedSortBy = 'publishedAt';
  selectedSortOrder = 'DESC';
  searchQuery = '';
  showPinnedOnly = false;
  
  // UI State
  showDeleteModal = false;
  newsToDelete: News | null = null;
  
  // Categories
  categories = Object.values(NewsCategory);
  statuses = [NewsStatus.DRAFT, NewsStatus.PUBLISHED, NewsStatus.ARCHIVED];
  sortOptions = [
    { value: 'publishedAt', label: 'Published Date' },
    { value: 'createdAt', label: 'Created Date' },
    { value: 'updatedAt', label: 'Updated Date' },
    { value: 'viewCount', label: 'View Count' }
  ];

  constructor(
    private newsService: NewsService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadNews();
    this.loadStatistics();
  }

  canManageNews(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  loadNews(): void {
    this.loading = true;
    this.error = '';
    
    const options: NewsQueryOptions = {
      page: this.currentPage,
      limit: this.pageSize,
      sortBy: this.selectedSortBy as any,
      sortOrder: this.selectedSortOrder as any
    };

    if (this.selectedCategory) {
      options.category = this.selectedCategory;
    }
    
    if (this.selectedStatus) {
      options.status = this.selectedStatus;
    }
    
    if (this.showPinnedOnly) {
      options.isPinned = true;
    }
    
    if (this.searchQuery.trim()) {
      options.search = this.searchQuery.trim();
    }

    this.newsService.getNewsList(options).subscribe({
      next: (response) => {
        this.newsList = response.data;
        this.totalItems = response.pagination.total;
        this.totalPages = response.pagination.totalPages;
        this.loading = false;

        // Keep statistic cards in sync
        this.loadStatistics();
      },
      error: (err) => {
        this.error = 'Failed to load news articles';
        this.loading = false;
        console.error('Error loading news:', err);
      }
    });
  }

  loadStatistics(): void {
    if (!this.canManageNews()) return;

    this.newsService.getNewsStatistics().subscribe({
      next: (stats) => {
        // Total Articles card uses totalItems (pagination total) in template;
        // if list isn't loaded yet, stats.total is still useful.
        if (!this.totalItems) {
          this.totalItems = stats.total;
          this.totalPages = Math.ceil((stats.total || 0) / this.pageSize);
        }

        this.pinnedCount = stats.pinned || 0;
        this.publishedCount = stats.published || 0;

        // totalViews isn't provided by the stats endpoint; compute from current list page as a fallback.
        this.totalViews = this.newsList.reduce((sum, n) => sum + (n.viewCount || 0), 0);
      },
      error: (err) => {
        console.error('Error loading news statistics:', err);
      }
    });
  }

  onSearch(): void {
    this.currentPage = 1;
    this.loadNews();
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.loadNews();
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadNews();
    }
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
    this.loadNews();
  }

  onSortChange(): void {
    this.loadNews();
  }

  togglePinnedFilter(): void {
    this.showPinnedOnly = !this.showPinnedOnly;
    this.onFilterChange();
  }

  confirmDelete(news: News): void {
    this.newsToDelete = news;
    this.showDeleteModal = true;
  }

  cancelDelete(): void {
    this.showDeleteModal = false;
    this.newsToDelete = null;
  }

  deleteNews(): void {
    if (!this.newsToDelete) return;

    this.newsService.deleteNews(this.newsToDelete.id).subscribe({
      next: () => {
        this.success = 'News article deleted successfully';
        this.showDeleteModal = false;
        this.newsToDelete = null;
        this.loadNews();
        this.loadStatistics();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = 'Failed to delete news article';
        console.error('Error deleting news:', err);
        setTimeout(() => this.error = '', 5000);
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

  isNewsActive(news: News): boolean {
    return this.newsService.isNewsActive(news);
  }

  clearFilters(): void {
    this.selectedCategory = '';
    this.selectedStatus = '';
    this.searchQuery = '';
    this.showPinnedOnly = false;
    this.selectedSortBy = 'publishedAt';
    this.selectedSortOrder = 'DESC';
    this.currentPage = 1;
    this.loadNews();
  }

  hasActiveFilters(): boolean {
    return !!(
      this.selectedCategory ||
      this.selectedStatus ||
      this.searchQuery.trim() ||
      this.showPinnedOnly
    );
  }

  // Helper methods for template arithmetic
  getNextPage(): number {
    return this.currentPage + 1;
  }

  getPrevPage(): number {
    return this.currentPage - 1;
  }

  isLastPage(): boolean {
    return this.currentPage === this.totalPages;
  }

  isFirstPage(): boolean {
    return this.currentPage === 1;
  }

  canGoNext(): boolean {
    return this.currentPage < this.totalPages;
  }

  canGoPrev(): boolean {
    return this.currentPage > 1;
  }

  // Helper methods for template expressions
  getNewsTitle(): string {
    return this.newsToDelete?.title || '';
  }

  getNewsSummary(): string {
    if (this.newsToDelete?.summary) {
      return this.newsToDelete.summary;
    }
    if (this.newsToDelete?.content) {
      return (this.newsToDelete.content.slice(0, 100));
    }
    return '';
  }

  getDeleteButtonText(): string {
    return 'Delete';
  }

  // Event handlers
  onSearchChange(): void {
    this.currentPage = 1;
    this.loadNews();
  }

  resetFilters(): void {
    this.selectedCategory = '';
    this.selectedStatus = '';
    this.selectedSortBy = 'publishedAt';
    this.selectedSortOrder = 'DESC';
    this.searchQuery = '';
    this.showPinnedOnly = false;
    this.currentPage = 1;
    this.loadNews();
  }

  // Pagination methods
  getPageNumbers(): number[] {
    const pages: number[] = [];
    const startPage = Math.max(1, this.currentPage - 2);
    const endPage = Math.min(this.totalPages, this.currentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  }

  // Utility methods
  trackByNewsId(index: number, news: News): string {
    return news.id;
  }
}
