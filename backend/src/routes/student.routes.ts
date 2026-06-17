import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { requireModuleView, requirePermission } from '../middleware/requirePermission';
import { UserRole } from '../entities/User';
import {
  registerStudent,
  correctStudentStatus,
  bulkCorrectStudentStatus,
  getStudents,
  getStudentById,
  getLinkedParentsForStudent,
  enrollStudent,
  updateStudent,
  deleteStudent,
  promoteStudents,
  generateStudentIdCard,
  generateStudentTransportIdCard,
  transferStudent,
  getStudentTransfers,
  generateTransportBusIdCards,
  generateTransportStudentsReport,
  generateDiningHallStudentsReport
} from '../controllers/student.controller';
import { upload } from '../utils/upload';

const router = Router();

router.use(authenticate);

router.post('/', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), requirePermission('students', 'create'), upload.single('photo'), registerStudent);
router.get('/', requireModuleView('students'), getStudents);
router.put('/:id/status', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), correctStudentStatus);
router.post('/status-corrections/bulk', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), bulkCorrectStudentStatus);
router.post('/enroll', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER, UserRole.DEMO_USER), enrollStudent);
router.post('/promote', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), promoteStudents);
router.post('/transfer', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), transferStudent);
router.get('/logistics/transport/bus-id-cards', generateTransportBusIdCards);
router.get('/logistics/transport/report', generateTransportStudentsReport);
router.get('/logistics/dining-hall/report', generateDiningHallStudentsReport);
router.get('/:id/id-card', generateStudentIdCard);
router.get('/:id/bus-id-card', generateStudentTransportIdCard);
router.get('/:id/transfers', authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER, UserRole.DEMO_USER), getStudentTransfers);
router.get('/linked-parents', authorize(UserRole.STUDENT, UserRole.DEMO_USER, UserRole.ADMIN, UserRole.SUPERADMIN), getLinkedParentsForStudent);
router.get('/:id', getStudentById);
router.put(
  '/:id',
  authorize(
    UserRole.SUPERADMIN,
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.TEACHER,
    UserRole.DEMO_USER
  ),
  upload.single('photo'),
  updateStudent
);
router.delete(
  '/:id',
  authorize(
    UserRole.SUPERADMIN,
    UserRole.DIRECTOR,
    UserRole.ADMIN,
    UserRole.HEADMASTER,
    UserRole.DEPUTY_HEADMASTER,
    UserRole.ACCOUNTANT,
    UserRole.DEMO_USER
  ),
  deleteStudent
);

export default router;

