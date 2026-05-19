export enum NewsCategory {
  GENERAL = 'general',
  ACADEMIC = 'academic',
  EVENTS = 'events',
  SPORTS = 'sports',
  ANNOUNCEMENT = 'announcement',
  HOLIDAY = 'holiday',
  EXAMINATION = 'examination',
  ADMISSION = 'admission',
  STAFF = 'staff',
  FACILITY = 'facility'
}

export enum NewsStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived'
}

export interface News {
  id: string;
  title: string;
  content: string;
  summary?: string;
  category: NewsCategory;
  status: NewsStatus;
  isPinned: boolean;
  publishedAt?: string;
  expiresAt?: string;
  imageUrl?: string;
  targetRoles?: string[];
  attachments?: string[];
  viewCount: number;
  allowComments: boolean;
  tags?: string;
  authorId: string;
  author: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    role: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateNewsData {
  title: string;
  content: string;
  summary?: string;
  category: NewsCategory;
  status?: NewsStatus;
  isPinned?: boolean;
  publishedAt?: string;
  expiresAt?: string;
  imageUrl?: string;
  targetRoles?: string[];
  attachments?: string[];
  allowComments?: boolean;
  tags?: string;
}

export interface UpdateNewsData extends Partial<CreateNewsData> {
  id: string;
}

export interface NewsQueryOptions {
  page?: number;
  limit?: number;
  category?: NewsCategory;
  status?: NewsStatus;
  isPinned?: boolean;
  authorId?: string;
  search?: string;
  sortBy?: 'createdAt' | 'publishedAt' | 'updatedAt' | 'viewCount';
  sortOrder?: 'ASC' | 'DESC';
  includeExpired?: boolean;
}

export interface NewsListResponse {
  data: News[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface NewsStatistics {
  total: number;
  published: number;
  draft: number;
  archived: number;
  pinned: number;
  expired: number;
}
