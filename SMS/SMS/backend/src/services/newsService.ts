import { AppDataSource } from '../config/database';
import { News, NewsCategory, NewsStatus } from '../entities/News';
import { User, UserRole } from '../entities/User';
import { And, Brackets, IsNull, LessThan, Like, MoreThan, Not } from 'typeorm';

export interface CreateNewsData {
  title: string;
  content: string;
  summary?: string;
  category: NewsCategory;
  status?: NewsStatus;
  isPinned?: boolean;
  publishedAt?: Date;
  expiresAt?: Date;
  imageUrl?: string;
  targetRoles?: UserRole[];
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
  userRole?: UserRole;
}

export class NewsService {
  private newsRepository = AppDataSource.getRepository(News);
  private userRepository = AppDataSource.getRepository(User);

  // Create news article
  async createNews(authorId: string, data: CreateNewsData): Promise<News> {
    const news = new News();
    news.title = data.title;
    news.content = data.content;
    news.summary = data.summary || null;
    news.category = data.category;
    news.status = data.status || NewsStatus.DRAFT;
    news.isPinned = data.isPinned || false;
    news.publishedAt = data.publishedAt || null;
    news.expiresAt = data.expiresAt || null;
    news.imageUrl = data.imageUrl || null;
    news.targetRoles = data.targetRoles || null;
    news.attachments = data.attachments || null;
    news.allowComments = data.allowComments !== false;
    news.tags = data.tags || null;
    news.authorId = authorId;

    // Validate author exists
    const author = await this.userRepository.findOne({ where: { id: authorId } });
    if (!author) {
      throw new Error('Author not found');
    }

    return await this.newsRepository.save(news);
  }

  // Update news article
  async updateNews(id: string, data: UpdateNewsData): Promise<News> {
    const news = await this.newsRepository.findOne({ where: { id } });
    if (!news) {
      throw new Error('News article not found');
    }

    // Update fields
    if (data.title !== undefined) news.title = data.title;
    if (data.content !== undefined) news.content = data.content;
    if (data.summary !== undefined) news.summary = data.summary;
    if (data.category !== undefined) news.category = data.category;
    if (data.status !== undefined) news.status = data.status;
    if (data.isPinned !== undefined) news.isPinned = data.isPinned;
    if (data.publishedAt !== undefined) news.publishedAt = data.publishedAt;
    if (data.expiresAt !== undefined) news.expiresAt = data.expiresAt;
    if (data.imageUrl !== undefined) news.imageUrl = data.imageUrl;
    if (data.targetRoles !== undefined) news.targetRoles = data.targetRoles;
    if (data.attachments !== undefined) news.attachments = data.attachments;
    if (data.allowComments !== undefined) news.allowComments = data.allowComments;
    if (data.tags !== undefined) news.tags = data.tags;

    return await this.newsRepository.save(news);
  }

  // Delete news article
  async deleteNews(id: string): Promise<void> {
    const news = await this.newsRepository.findOne({ where: { id } });
    if (!news) {
      throw new Error('News article not found');
    }

    await this.newsRepository.remove(news);
  }

  // Get news by ID
  async getNewsById(id: string, incrementView = false): Promise<News | null> {
    const news = await this.newsRepository.findOne({ 
      where: { id },
      relations: ['author']
    });

    if (news && incrementView) {
      news.viewCount += 1;
      await this.newsRepository.save(news);
    }

    return news;
  }

  // Get news list with filtering and pagination
  async getNewsList(options: NewsQueryOptions = {}) {
    const {
      page = 1,
      limit = 10,
      category,
      status,
      isPinned,
      authorId,
      search,
      sortBy = 'publishedAt',
      sortOrder = 'DESC',
      includeExpired = false,
      userRole
    } = options;

    const skip = (page - 1) * limit;

    // Build query conditions
    const whereConditions: any = {};

    if (category) whereConditions.category = category;
    if (status) whereConditions.status = status;
    if (isPinned !== undefined) whereConditions.isPinned = isPinned;
    if (authorId) whereConditions.authorId = authorId;
    if (search) {
      whereConditions.title = Like(`%${search}%`);
    }

    // Role visibility for public feeds is handled via query builder below.

    // Exclude expired news unless explicitly requested
    if (!includeExpired) {
      const now = new Date();
      // handled via query builder so we can include both NULL and future expiry
    }

    // Build query
    const query = this.newsRepository
      .createQueryBuilder('news')
      .leftJoinAndSelect('news.author', 'author')
      .where(whereConditions);

    // Exclude expired news unless explicitly requested
    if (!includeExpired) {
      const now = new Date();
      query.andWhere(
        new Brackets(qb => {
          qb.where('news.expiresAt IS NULL').orWhere('news.expiresAt > :now', { now });
        })
      );
    }

    // Role-based visibility for targetRoles (stored as JSON array)
    // - If no role: only show news visible to everyone (NULL or empty array)
    // - If role: show visible-to-all + role-targeted items
    if (userRole) {
      query.andWhere(
        new Brackets(qb => {
          qb.where('"news"."targetRoles" IS NULL')
            .orWhere('"news"."targetRoles"::jsonb = \'[]\'::jsonb')
            .orWhere('"news"."targetRoles"::jsonb @> (:roleArr)::jsonb', { roleArr: JSON.stringify([userRole]) });
        })
      );
    } else {
      query.andWhere(
        new Brackets(qb => {
          qb.where('"news"."targetRoles" IS NULL')
            .orWhere('"news"."targetRoles"::jsonb = \'[]\'::jsonb');
        })
      );
    }

    // Add sorting
    switch (sortBy) {
      case 'createdAt':
        query.orderBy('news.createdAt', sortOrder);
        break;
      case 'publishedAt':
        query.orderBy('news.isPinned', 'DESC')
             .addOrderBy('news.publishedAt', sortOrder);
        break;
      case 'updatedAt':
        query.orderBy('news.updatedAt', sortOrder);
        break;
      case 'viewCount':
        query.orderBy('news.viewCount', sortOrder);
        break;
      default:
        query.orderBy('news.isPinned', 'DESC')
             .addOrderBy('news.publishedAt', 'DESC');
    }

    // Get total count
    const total = await query.getCount();

    // Get paginated results
    const news = await query
      .skip(skip)
      .take(limit)
      .getMany();

    // Filter expired news in application layer if needed
    const filteredNews = includeExpired ? news : news.filter(item => 
      !item.expiresAt || item.expiresAt > new Date()
    );

    return {
      news: filteredNews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };
  }

  // Get published news for public feed
  async getPublishedNews(userRole?: UserRole, options: Omit<NewsQueryOptions, 'status'> = {}) {
    return this.getNewsList({
      ...options,
      status: NewsStatus.PUBLISHED,
      userRole
    });
  }

  // Get news by author
  async getNewsByAuthor(authorId: string, options: NewsQueryOptions = {}) {
    return this.getNewsList({
      ...options,
      authorId
    });
  }

  // Get news by category
  async getNewsByCategory(category: NewsCategory, options: NewsQueryOptions = {}) {
    return this.getNewsList({
      ...options,
      category
    });
  }

  // Get pinned news
  async getPinnedNews(userRole?: UserRole) {
    return this.getNewsList({
      isPinned: true,
      status: NewsStatus.PUBLISHED,
      userRole,
      limit: 10
    });
  }

  // Get news statistics
  async getNewsStatistics(authorId?: string) {
    const whereConditions = authorId ? { authorId } : {};

    const [
      total,
      published,
      draft,
      archived,
      pinned,
      expired
    ] = await Promise.all([
      this.newsRepository.count({ where: whereConditions }),
      this.newsRepository.count({ where: { ...whereConditions, status: NewsStatus.PUBLISHED } }),
      this.newsRepository.count({ where: { ...whereConditions, status: NewsStatus.DRAFT } }),
      this.newsRepository.count({ where: { ...whereConditions, status: NewsStatus.ARCHIVED } }),
      this.newsRepository.count({ where: { ...whereConditions, isPinned: true } }),
      this.newsRepository.count({
        where: {
          ...whereConditions,
          expiresAt: LessThan(new Date())
        }
      })
    ]);

    return {
      total,
      published,
      draft,
      archived,
      pinned,
      expired
    };
  }

  // Archive expired news
  async archiveExpiredNews(): Promise<number> {
    const expiredNews = await this.newsRepository.find({
      where: {
        status: NewsStatus.PUBLISHED,
        expiresAt: LessThan(new Date())
      }
    });

    for (const news of expiredNews) {
      news.status = NewsStatus.ARCHIVED;
    }

    await this.newsRepository.save(expiredNews);
    return expiredNews.length;
  }

  // Increment view count
  async incrementViewCount(id: string): Promise<void> {
    await this.newsRepository.increment({ id }, 'viewCount', 1);
  }
}
