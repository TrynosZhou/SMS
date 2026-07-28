import { Router } from 'express';
import { authenticate, optionalAuthenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { chatbotRateLimit } from '../middleware/chatbotRateLimit';
import {
  chat,
  escalate,
  listFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  listConversations,
  getConversationMessages,
  listTickets,
  updateTicket,
  chatbotStatus,
} from '../controllers/chatbot.controller';

const router = Router();

const adminRoles = [
  UserRole.ADMIN,
  UserRole.SUPERADMIN,
  UserRole.DIRECTOR,
  UserRole.HEADMASTER,
  UserRole.DEPUTY_HEADMASTER,
];

/** Public/auth chat — optional auth so guests (login page) can use helpdesk */
router.get('/status', chatbotStatus);
router.get('/faqs', optionalAuthenticate, listFaqs);
router.post('/chat', optionalAuthenticate, chatbotRateLimit, chat);
router.post('/escalate', optionalAuthenticate, chatbotRateLimit, escalate);
router.get('/conversations/:id/messages', optionalAuthenticate, getConversationMessages);

/** Admin management */
router.post('/faqs', authenticate, authorize(...adminRoles), createFaq);
router.put('/faqs/:id', authenticate, authorize(...adminRoles), updateFaq);
router.delete('/faqs/:id', authenticate, authorize(...adminRoles), deleteFaq);
router.get('/admin/conversations', authenticate, authorize(...adminRoles), listConversations);
router.get('/admin/tickets', authenticate, authorize(...adminRoles), listTickets);
router.patch('/admin/tickets/:id', authenticate, authorize(...adminRoles), updateTicket);

export default router;
