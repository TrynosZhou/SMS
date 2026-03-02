import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/roleCheck';
import {
  createNews,
  updateNews,
  deleteNews,
  getNewsById,
  getNewsList,
  getNewsStatistics,
  archiveExpiredNews,
  getPublishedNews,
  getPinnedNews,
  getNewsCategories
} from '../controllers/news.controller';

const router = Router();

// Admin-only routes (require authentication + admin role)
router.post('/', authenticate, requireAdmin, createNews);
router.put('/:id', authenticate, requireAdmin, updateNews);
router.delete('/:id', authenticate, requireAdmin, deleteNews);
router.get('/admin/statistics', authenticate, requireAdmin, getNewsStatistics);
router.post('/admin/archive-expired', authenticate, requireAdmin, archiveExpiredNews);

// Admin/Authenticated routes
router.get('/admin', authenticate, requireAdmin, getNewsList);
router.get('/admin/:id', authenticate, requireAdmin, getNewsById);

// Public routes (no authentication required)
router.get('/public', optionalAuthenticate, getPublishedNews);
router.get('/public/pinned', optionalAuthenticate, getPinnedNews);
router.get('/public/categories', getNewsCategories);
router.get('/public/:id', getNewsById);

export default router;
