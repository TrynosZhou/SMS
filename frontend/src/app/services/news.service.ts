import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { 
  News, 
  CreateNewsData, 
  UpdateNewsData, 
  NewsQueryOptions, 
  NewsListResponse, 
  NewsStatistics,
  NewsCategory 
} from '../types/news';

@Injectable({
  providedIn: 'root'
})
export class NewsService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  // Admin-only CRUD operations
  createNews(newsData: CreateNewsData): Observable<News> {
    return this.http.post<{message: string, data: News}>(`${this.apiUrl}/news`, newsData).pipe(
      map(response => response.data),
      catchError(error => {
        console.error('Error creating news:', error);
        throw error;
      })
    );
  }

  updateNews(id: string, newsData: UpdateNewsData): Observable<News> {
    return this.http.put<{message: string, data: News}>(`${this.apiUrl}/news/${id}`, newsData).pipe(
      map(response => response.data),
      catchError(error => {
        console.error('Error updating news:', error);
        throw error;
      })
    );
  }

  deleteNews(id: string): Observable<void> {
    return this.http.delete<{message: string}>(`${this.apiUrl}/news/${id}`).pipe(
      map(() => {}),
      catchError(error => {
        console.error('Error deleting news:', error);
        throw error;
      })
    );
  }

  getNewsById(id: string, incrementView = false, useAdminEndpoint = false): Observable<News> {
    let params = new HttpParams();
    if (incrementView) {
      params = params.set('incrementView', 'true');
    }

    const endpoint = useAdminEndpoint ? `${this.apiUrl}/news/admin/${id}` : `${this.apiUrl}/news/public/${id}`;

    return this.http.get<{message: string, data: News}>(endpoint, { params }).pipe(
      map(response => response.data),
      catchError(error => {
        console.error('Error getting news by ID:', error);
        throw error;
      })
    );
  }

  getNewsList(options: NewsQueryOptions = {}): Observable<NewsListResponse> {
    const params = this.buildQueryParams(options);
    return this.http.get<{message: string, data: News[], pagination: any}>(`${this.apiUrl}/news/admin`, { params }).pipe(
      map(response => ({
        data: response.data,
        pagination: response.pagination
      })),
      catchError(error => {
        console.error('Error getting news list:', error);
        throw error;
      })
    );
  }

  getNewsStatistics(authorId?: string): Observable<NewsStatistics> {
    let params = new HttpParams();
    if (authorId) {
      params = params.set('authorId', authorId);
    }
    return this.http.get<{message: string, data: NewsStatistics}>(`${this.apiUrl}/news/admin/statistics`, { params }).pipe(
      map(response => response.data),
      catchError(error => {
        console.error('Error getting news statistics:', error);
        throw error;
      })
    );
  }

  archiveExpiredNews(): Observable<{archivedCount: number}> {
    return this.http.post<{message: string, data: {archivedCount: number}}>(`${this.apiUrl}/news/admin/archive-expired`, {}).pipe(
      map(response => response.data),
      catchError(error => {
        console.error('Error archiving expired news:', error);
        throw error;
      })
    );
  }

  // Public endpoints
  getPublishedNews(options: Omit<NewsQueryOptions, 'status'> = {}): Observable<NewsListResponse> {
    const params = this.buildQueryParams(options);
    return this.http.get<{message: string, data: News[], pagination: any}>(`${this.apiUrl}/news/public`, { params }).pipe(
      map(response => ({
        data: response.data,
        pagination: response.pagination
      })),
      catchError(error => {
        console.error('Error getting published news:', error);
        throw error;
      })
    );
  }

  getPinnedNews(): Observable<News[]> {
    return this.http.get<{message: string, data: News[]}>(`${this.apiUrl}/news/public/pinned`).pipe(
      map(response => response.data),
      catchError(error => {
        console.error('Error getting pinned news:', error);
        throw error;
      })
    );
  }

  getNewsCategories(): Observable<NewsCategory[]> {
    return this.http.get<{message: string, data: NewsCategory[]}>(`${this.apiUrl}/news/public/categories`).pipe(
      map(response => response.data),
      catchError(error => {
        console.error('Error getting news categories:', error);
        throw error;
      })
    );
  }

  // Helper methods
  private buildQueryParams(options: NewsQueryOptions): any {
    const params: any = {};
    
    if (options.page) params.page = options.page;
    if (options.limit) params.limit = options.limit;
    if (options.category) params.category = options.category;
    if (options.status) params.status = options.status;
    if (options.isPinned !== undefined) params.isPinned = options.isPinned;
    if (options.authorId) params.authorId = options.authorId;
    if (options.search) params.search = options.search;
    if (options.sortBy) params.sortBy = options.sortBy;
    if (options.sortOrder) params.sortOrder = options.sortOrder;
    if (options.includeExpired !== undefined) params.includeExpired = options.includeExpired;
    
    return params;
  }

  // Utility methods for UI
  getCategoryLabel(category: NewsCategory): string {
    const labels = {
      [NewsCategory.GENERAL]: 'General',
      [NewsCategory.ACADEMIC]: 'Academic',
      [NewsCategory.EVENTS]: 'Events',
      [NewsCategory.SPORTS]: 'Sports',
      [NewsCategory.ANNOUNCEMENT]: 'Announcement',
      [NewsCategory.HOLIDAY]: 'Holiday',
      [NewsCategory.EXAMINATION]: 'Examination',
      [NewsCategory.ADMISSION]: 'Admission',
      [NewsCategory.STAFF]: 'Staff',
      [NewsCategory.FACILITY]: 'Facility'
    };
    return labels[category] || category;
  }

  getStatusLabel(status: string): string {
    const labels: {[key: string]: string} = {
      'draft': 'Draft',
      'published': 'Published',
      'archived': 'Archived'
    };
    return labels[status] || status;
  }

  getStatusColor(status: string): string {
    const colors: {[key: string]: string} = {
      'draft': '#6b7280', // gray
      'published': '#10b981', // green
      'archived': '#f59e0b' // amber
    };
    return colors[status] || '#6b7280';
  }

  getCategoryColor(category: NewsCategory): string {
    const colors = {
      [NewsCategory.GENERAL]: '#3b82f6', // blue
      [NewsCategory.ACADEMIC]: '#8b5cf6', // purple
      [NewsCategory.EVENTS]: '#ec4899', // pink
      [NewsCategory.SPORTS]: '#10b981', // green
      [NewsCategory.ANNOUNCEMENT]: '#f59e0b', // amber
      [NewsCategory.HOLIDAY]: '#ef4444', // red
      [NewsCategory.EXAMINATION]: '#6366f1', // indigo
      [NewsCategory.ADMISSION]: '#14b8a6', // teal
      [NewsCategory.STAFF]: '#84cc16', // lime
      [NewsCategory.FACILITY]: '#f97316' // orange
    };
    return colors[category] || '#3b82f6';
  }

  isNewsActive(news: News): boolean {
    if (news.status !== 'published') return false;
    if (!news.publishedAt) return false;
    
    const publishedDate = new Date(news.publishedAt);
    const now = new Date();
    
    if (publishedDate > now) return false;
    
    if (news.expiresAt) {
      const expiryDate = new Date(news.expiresAt);
      if (expiryDate <= now) return false;
    }
    
    return true;
  }

  formatDate(dateString?: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatViewCount(count: number): string {
    if (count < 1000) return count.toString();
    if (count < 1000000) return (count / 1000).toFixed(1) + 'K';
    return (count / 1000000).toFixed(1) + 'M';
  }
}
