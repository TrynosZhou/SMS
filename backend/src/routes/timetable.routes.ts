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

router.use(authenticate);

// Configuration (must come before /:id routes)
router.get('/config/active', getTimetableConfig);
router.post('/config', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), saveTimetableConfig);

// Generation (must come before /:id routes)
router.post('/generate', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), generateTimetable);
router.get('/assignments/all', getAssignments);

// Basic CRUD
router.get('/', getTimetables);
router.post('/', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), createTimetable);

// Manual entry management (must come before /:id routes)
router.post('/entries/manual', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), createTimetableEntryManual);
router.put('/entries/:id/manual', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), updateTimetableEntryManual);
router.put('/entries/:id/lock', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), toggleEntryLock);

// Parameterized routes (must come last)
router.get('/:timetableId/conflicts', detectConflicts);
router.get('/:timetableId/versions', getTimetableVersions);
router.post('/:timetableId/versions', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), createTimetableVersion);
router.post('/versions/:versionId/changes', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), logTimetableChange);
router.get('/:id', getTimetableById);
router.put('/:id', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), updateTimetable);
router.delete('/:id', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), deleteTimetable);

export default router;

