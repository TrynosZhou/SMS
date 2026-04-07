import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getInventorySettings,
  putInventorySettings,
  listTextbooks,
  createTextbook,
  updateTextbook,
  deleteTextbook,
  listFurniture,
  createFurniture,
  updateFurniture,
  deleteFurniture,
  issueTextbookPermanent,
  borrowTextbook,
  returnTextbookIssuance,
  markTextbookLost,
  issueFurniture,
  returnFurnitureIssuance,
  markFurnitureLost,
  listTextbookIssuances,
  listFurnitureIssuances,
  createInventoryFine,
  updateFineStatus,
  listInventoryFines,
  getStudentInventorySummary,
  getMyInventory,
  reportLostItems,
  reportTextbookIssuance,
  reportFurnitureIssuance,
  reportLoanHistory,
  listInventoryAudit
} from '../controllers/inventory.controller';

const router = Router();
router.use(authenticate);

router.get('/settings', getInventorySettings);
router.put('/settings', putInventorySettings);

router.get('/textbooks', listTextbooks);
router.post('/textbooks', createTextbook);
router.put('/textbooks/:id', updateTextbook);
router.delete('/textbooks/:id', deleteTextbook);

router.get('/furniture', listFurniture);
router.post('/furniture', createFurniture);
router.put('/furniture/:id', updateFurniture);
router.delete('/furniture/:id', deleteFurniture);

router.post('/textbooks/:catalogId/issue-permanent', issueTextbookPermanent);
router.post('/textbooks/:catalogId/borrow', borrowTextbook);
router.post('/textbook-issuances/:id/return', returnTextbookIssuance);
router.post('/textbook-issuances/:id/mark-lost', markTextbookLost);

router.post('/furniture/:furnitureId/issue', issueFurniture);
router.post('/furniture-issuances/:id/return', returnFurnitureIssuance);
router.post('/furniture-issuances/:id/mark-lost', markFurnitureLost);

router.get('/issuances/textbooks', listTextbookIssuances);
router.get('/issuances/furniture', listFurnitureIssuances);

router.post('/fines', createInventoryFine);
router.patch('/fines/:id/status', updateFineStatus);
router.get('/fines', listInventoryFines);

router.get('/me', getMyInventory);
router.get('/students/:studentId/summary', getStudentInventorySummary);

router.get('/reports/lost', reportLostItems);
router.get('/reports/textbook-issuance', reportTextbookIssuance);
router.get('/reports/furniture-issuance', reportFurnitureIssuance);
router.get('/reports/loan-history', reportLoanHistory);
router.get('/audit', listInventoryAudit);

export default router;
