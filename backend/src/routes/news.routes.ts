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

const newsAdminGuard = [authenticate, requireAdmin];

// Admin-only routes (require authentication + admin role)
router.post('/', ...newsAdminGuard, createNews);
router.put('/:id', ...newsAdminGuard, updateNews);
router.delete('/:id', ...newsAdminGuard, deleteNews);
router.get('/admin/statistics', ...newsAdminGuard, getNewsStatistics);
router.post('/admin/archive-expired', ...newsAdminGuard, archiveExpiredNews);

// Admin/Authenticated routes
router.get('/admin', ...newsAdminGuard, getNewsList);
router.get('/admin/:id', ...newsAdminGuard, getNewsById);

// Public routes (no authentication required)
router.get('/public', optionalAuthenticate, getPublishedNews);
router.get('/public/pinned', optionalAuthenticate, getPinnedNews);
router.get('/public/categories', getNewsCategories);
router.get('/public/:id', getNewsById);

export default router;
