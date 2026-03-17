import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  getTimetables,
  getTimetableById,
  createTimetable,
  updateTimetable,
  deleteTimetable,
  getTimetableConfig,
  saveTimetableConfig,
  generateTimetable,
  detectConflicts,
  getAssignments,
  getTimetableVersions,
  createTimetableVersion,
  logTimetableChange,
  createTimetableEntryManual,
  updateTimetableEntryManual,
  toggleEntryLock
} from '../controllers/timetable.controller';

const router = Router();

// Configuration (must come before /:id routes)
router.get('/config/active', authenticate, getTimetableConfig);
router.post('/config', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), saveTimetableConfig);

// Generation (must come before /:id routes)
router.post('/generate', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), generateTimetable);
router.get('/assignments/all', authenticate, getAssignments);

// Basic CRUD
router.get('/', authenticate, getTimetables);
router.post('/', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), createTimetable);

// Manual entry management (must come before /:id routes)
router.post('/entries/manual', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), createTimetableEntryManual);
router.put('/entries/:id/manual', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), updateTimetableEntryManual);
router.put('/entries/:id/lock', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), toggleEntryLock);

// Parameterized routes (must come last)
router.get('/:timetableId/conflicts', authenticate, detectConflicts);
router.get('/:timetableId/versions', authenticate, getTimetableVersions);
router.post('/:timetableId/versions', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), createTimetableVersion);
router.post('/versions/:versionId/changes', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), logTimetableChange);
router.get('/:id', authenticate, getTimetableById);
router.put('/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), updateTimetable);
router.delete('/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), deleteTimetable);

export default router;

