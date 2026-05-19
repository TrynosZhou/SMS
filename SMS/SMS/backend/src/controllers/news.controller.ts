import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { News, NewsCategory, NewsStatus } from '../entities/News';
import { AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/roleCheck';
import { NewsService, CreateNewsData, UpdateNewsData } from '../services/newsService';
import { validate } from '../utils/validation';

const newsService = new NewsService();

// Validation schemas
const createNewsSchema: {[key: string]: any} = {
  title: { type: 'string', required: true, minLength: 3, maxLength: 255 },
  content: { type: 'string', required: true, minLength: 10 },
  summary: { type: 'string', maxLength: 255, optional: true },
  category: { type: 'string', enum: Object.values(NewsCategory), required: true },
  status: { type: 'string', enum: Object.values(NewsStatus), optional: true },
  isPinned: { type: 'boolean', optional: true },
  publishedAt: { type: 'date', optional: true },
  expiresAt: { type: 'date', optional: true },
  imageUrl: { type: 'string', maxLength: 500, optional: true },
  targetRoles: { type: 'array', items: 'string', optional: true },
  attachments: { type: 'array', items: 'string', optional: true },
  allowComments: { type: 'boolean', optional: true },
  tags: { type: 'string', optional: true }
};

const updateNewsSchema: {[key: string]: any} = {
  ...createNewsSchema,
  title: { type: 'string', minLength: 3, maxLength: 255, optional: true },
  content: { type: 'string', minLength: 10, optional: true },
  category: { type: 'string', enum: Object.values(NewsCategory), optional: true }
};

// Admin-only endpoints
export const createNews = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // Validate input
    const validation = validate(req.body, createNewsSchema);
    if (!validation.isValid) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: validation.errors
      });
    }

    const authorId = req.user!.id; // From authenticated user
    const newsData: CreateNewsData = req.body;

    const news = await newsService.createNews(authorId, newsData);
    
    res.status(201).json({
      message: 'News article created successfully',
      data: news
    });
  } catch (error: any) {
    console.error('Create news error:', error);
    res.status(500).json({ 
      message: 'Failed to create news article',
      error: error.message 
    });
  }
};

export const updateNews = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;

    // Validate input
    const validation = validate(req.body, updateNewsSchema);
    if (!validation.isValid) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: validation.errors
      });
    }

    const updateData: UpdateNewsData = { id, ...req.body };

    const news = await newsService.updateNews(id, updateData);
    
    res.json({
      message: 'News article updated successfully',
      data: news
    });
  } catch (error: any) {
    console.error('Update news error:', error);
    if (error.message === 'News article not found') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ 
      message: 'Failed to update news article',
      error: error.message 
    });
  }
};

export const deleteNews = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;

    await newsService.deleteNews(id);
    
    res.json({
      message: 'News article deleted successfully'
    });
  } catch (error: any) {
    console.error('Delete news error:', error);
    if (error.message === 'News article not found') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ 
      message: 'Failed to delete news article',
      error: error.message 
    });
  }
};

export const getNewsById = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const incrementView = req.query.incrementView === 'true';

    const news = await newsService.getNewsById(id, incrementView);
    
    if (!news) {
      return res.status(404).json({ message: 'News article not found' });
    }

    res.json({
      message: 'News article retrieved successfully',
      data: news
    });
  } catch (error: any) {
    console.error('Get news error:', error);
    res.status(500).json({ 
      message: 'Failed to retrieve news article',
      error: error.message 
    });
  }
};

export const getNewsList = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

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
      includeExpired = 'false'
    } = req.query;

    const isPinnedFilter =
      typeof isPinned === 'string'
        ? (isPinned === 'true' ? true : isPinned === 'false' ? false : undefined)
        : undefined;

    const options = {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      category: category as NewsCategory,
      status: status as NewsStatus,
      isPinned: isPinnedFilter,
      authorId: authorId as string,
      search: search as string,
      sortBy: sortBy as any,
      sortOrder: sortOrder as any,
      includeExpired: includeExpired === 'true'
    };

    const result = await newsService.getNewsList(options);
    
    res.json({
      message: 'News list retrieved successfully',
      data: result.news,
      pagination: result.pagination
    });
  } catch (error: any) {
    console.error('Get news list error:', error);
    res.status(500).json({ 
      message: 'Failed to retrieve news list',
      error: error.message 
    });
  }
};

export const getNewsStatistics = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const authorId = req.query.authorId as string;
    const statistics = await newsService.getNewsStatistics(authorId);
    
    res.json({
      message: 'News statistics retrieved successfully',
      data: statistics
    });
  } catch (error: any) {
    console.error('Get news statistics error:', error);
    res.status(500).json({ 
      message: 'Failed to retrieve news statistics',
      error: error.message 
    });
  }
};

export const archiveExpiredNews = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const archivedCount = await newsService.archiveExpiredNews();
    
    res.json({
      message: 'Expired news archived successfully',
      data: { archivedCount }
    });
  } catch (error: any) {
    console.error('Archive expired news error:', error);
    res.status(500).json({ 
      message: 'Failed to archive expired news',
      error: error.message 
    });
  }
};

// Public endpoints (no authentication required)
export const getPublishedNews = async (req: any, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const {
      page = 1,
      limit = 10,
      category,
      isPinned,
      search,
      sortBy = 'publishedAt',
      sortOrder = 'DESC'
    } = req.query;

    const userRole = req.user?.role; // Optional: from auth middleware if present

    const isPinnedFilter =
      typeof isPinned === 'string'
        ? (isPinned === 'true' ? true : isPinned === 'false' ? false : undefined)
        : undefined;

    const options = {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      category: category as NewsCategory,
      isPinned: isPinnedFilter,
      search: search as string,
      sortBy: sortBy as any,
      sortOrder: sortOrder as any
    };

    const result = await newsService.getPublishedNews(userRole, options);
    
    res.json({
      message: 'Published news retrieved successfully',
      data: result.news,
      pagination: result.pagination
    });
  } catch (error: any) {
    console.error('Get published news error:', error);
    res.status(500).json({ 
      message: 'Failed to retrieve published news',
      error: error.message 
    });
  }
};

export const getPinnedNews = async (req: any, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const userRole = req.user?.role; // Optional: from auth middleware if present
    const result = await newsService.getPinnedNews(userRole);
    
    res.json({
      message: 'Pinned news retrieved successfully',
      data: result.news
    });
  } catch (error: any) {
    console.error('Get pinned news error:', error);
    res.status(500).json({ 
      message: 'Failed to retrieve pinned news',
      error: error.message 
    });
  }
};

export const getNewsCategories = async (req: any, res: Response) => {
  try {
    const categories = Object.values(NewsCategory);
    
    res.json({
      message: 'News categories retrieved successfully',
      data: categories
    });
  } catch (error: any) {
    console.error('Get news categories error:', error);
    res.status(500).json({ 
      message: 'Failed to retrieve news categories',
      error: error.message 
    });
  }
};
