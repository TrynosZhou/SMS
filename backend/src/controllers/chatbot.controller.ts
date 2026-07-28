import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { ChatbotFaq } from '../entities/ChatbotFaq';
import { ChatbotConversation } from '../entities/ChatbotConversation';
import { ChatbotMessage } from '../entities/ChatbotMessage';
import { ChatbotTicket, ChatbotTicketStatus } from '../entities/ChatbotTicket';
import { Settings } from '../entities/Settings';
import { UserRole } from '../entities/User';
import {
  findExactFaqMatch,
  retrieveRelevantFaqs,
} from '../services/chatbotRetrieval.service';
import {
  buildSystemPrompt,
  generateChatReply,
  getCachedAnswer,
  isOpenAiConfigured,
  setCachedAnswer,
} from '../services/chatbotOpenAi.service';

const MAX_MESSAGE_LENGTH = 1000;
const MAX_SESSION_ID_LENGTH = 100;

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior|system)\s+(instructions|prompts)/i,
  /you\s+are\s+now\s+(dan|unrestricted|jailbroken)/i,
  /reveal\s+(your\s+)?(system\s+prompt|api\s*key|secret)/i,
  /<\/?system>/i,
];

function sanitizeUserMessage(raw: unknown): string {
  let text = String(raw ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
  if (text.length > MAX_MESSAGE_LENGTH) {
    text = text.slice(0, MAX_MESSAGE_LENGTH);
  }
  return text;
}

function looksLikeInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

function clientIp(req: AuthRequest): string | null {
  const fwd = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
  return fwd || req.socket.remoteAddress || null;
}

function resolveRole(req: AuthRequest, bodyRole?: string): string {
  if (req.user?.role) return String(req.user.role).toLowerCase();
  const claimed = String(bodyRole || '').toLowerCase().trim();
  // Guests may only claim public/applicant
  if (claimed === 'applicant' || claimed === 'public') return claimed;
  return 'public';
}

function isAdminUser(req: AuthRequest): boolean {
  const role = req.user?.role;
  return (
    role === UserRole.ADMIN ||
    role === UserRole.SUPERADMIN ||
    role === UserRole.DIRECTOR ||
    role === UserRole.HEADMASTER ||
    role === UserRole.DEPUTY_HEADMASTER
  );
}

async function ensureDb() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
}

async function getSchoolName(): Promise<string> {
  try {
    const settings = await AppDataSource.getRepository(Settings).find({
      order: { createdAt: 'DESC' },
      take: 1,
      select: ['schoolName'],
    });
    return String(settings[0]?.schoolName || '').trim() || 'our school';
  } catch {
    return 'our school';
  }
}

async function getOrCreateConversation(opts: {
  conversationId?: string | null;
  sessionId: string;
  userId: string | null;
  userRole: string;
  ip: string | null;
}): Promise<ChatbotConversation> {
  const repo = AppDataSource.getRepository(ChatbotConversation);

  if (opts.conversationId) {
    const existing = await repo.findOne({ where: { id: opts.conversationId } });
    if (existing) {
      // Guests: must match session; auth users: must match userId when set
      if (opts.userId && existing.userId && existing.userId !== opts.userId) {
        throw Object.assign(new Error('Conversation access denied'), { status: 403 });
      }
      if (!opts.userId && existing.sessionId !== opts.sessionId) {
        throw Object.assign(new Error('Conversation access denied'), { status: 403 });
      }
      return existing;
    }
  }

  const conv = repo.create({
    sessionId: opts.sessionId,
    userId: opts.userId,
    userRole: opts.userRole,
    clientIp: opts.ip,
    messageCount: 0,
    lastUserMessage: null,
  });
  return repo.save(conv);
}

/** POST /chatbot/chat */
export const chat = async (req: AuthRequest, res: Response) => {
  try {
    await ensureDb();

    const message = sanitizeUserMessage(req.body?.message);
    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }
    if (looksLikeInjection(message)) {
      return res.status(400).json({
        message: 'Your message could not be processed. Please rephrase your question.',
      });
    }

    let sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId || sessionId.length > MAX_SESSION_ID_LENGTH) {
      sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    const role = resolveRole(req, req.body?.role);
    const userId = req.user?.id || null;
    const conversationId = req.body?.conversationId ? String(req.body.conversationId) : null;

    let conversation: ChatbotConversation;
    try {
      conversation = await getOrCreateConversation({
        conversationId,
        sessionId,
        userId,
        userRole: role,
        ip: clientIp(req),
      });
    } catch (err: any) {
      return res.status(err.status || 403).json({ message: err.message || 'Access denied' });
    }

    const faqRepo = AppDataSource.getRepository(ChatbotFaq);
    const messageRepo = AppDataSource.getRepository(ChatbotMessage);
    const convRepo = AppDataSource.getRepository(ChatbotConversation);

    const faqs = await faqRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });

    // Persist user message
    await messageRepo.save(
      messageRepo.create({
        conversationId: conversation.id,
        role: 'user',
        content: message,
        fromCache: false,
      })
    );

    let reply = '';
    let fromCache = false;
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;

    // 1) Exact FAQ match
    const exact = findExactFaqMatch(faqs, message, role);
    if (exact) {
      reply = exact.answer;
      fromCache = true;
    }

    // 2) In-memory cache of prior identical questions
    if (!reply) {
      const cached = getCachedAnswer(role, message);
      if (cached) {
        reply = cached;
        fromCache = true;
      }
    }

    // 3) OpenAI with retrieved FAQ context
    if (!reply) {
      if (!isOpenAiConfigured()) {
        const relevant = retrieveRelevantFaqs(faqs, message, role, 3);
        if (relevant.length) {
          reply =
            relevant.map((f, i) => `${i + 1}. ${f.question}\n${f.answer}`).join('\n\n') +
            '\n\n(Note: AI assistant is not configured. Showing closest FAQ matches. Ask an admin to set OPENAI_API_KEY, or escalate to support.)';
          fromCache = true;
        } else {
          reply =
            'The AI helpdesk is not configured yet (missing OPENAI_API_KEY). Please use Escalate to support, or contact the school office.';
          fromCache = true;
        }
      } else {
        const relevant = retrieveRelevantFaqs(faqs, message, role, 6);
        const schoolName = await getSchoolName();
        const systemPrompt = buildSystemPrompt({ role, schoolName, faqs: relevant });

        const prior = await messageRepo.find({
          where: { conversationId: conversation.id },
          order: { createdAt: 'ASC' },
          take: 24,
        });
        // Exclude the user message we just saved from "history" duplicate — generateChatReply adds current user message
        const history = prior
          .slice(0, -1)
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        try {
          const ai = await generateChatReply({
            systemPrompt,
            history,
            userMessage: message,
          });
          reply = ai.content;
          promptTokens = ai.promptTokens;
          completionTokens = ai.completionTokens;
          setCachedAnswer(role, message, reply);
        } catch (aiErr: any) {
          console.error('[chatbot] OpenAI error:', aiErr?.response?.data || aiErr?.message || aiErr);
          const relevantFallback = retrieveRelevantFaqs(faqs, message, role, 2);
          if (relevantFallback.length) {
            reply =
              'I had trouble reaching the AI service. Here are related FAQ answers:\n\n' +
              relevantFallback.map((f) => `• ${f.question}\n${f.answer}`).join('\n\n') +
              '\n\nYou can also Escalate to support.';
          } else {
            reply =
              'I could not reach the AI service right now. Please try again shortly or Escalate to support.';
          }
        }
      }
    }

    await messageRepo.save(
      messageRepo.create({
        conversationId: conversation.id,
        role: 'assistant',
        content: reply,
        fromCache,
        promptTokens,
        completionTokens,
      })
    );

    conversation.messageCount = Number(conversation.messageCount || 0) + 2;
    conversation.lastUserMessage = message.slice(0, 500);
    conversation.userRole = role;
    if (userId && !conversation.userId) conversation.userId = userId;
    await convRepo.save(conversation);

    return res.json({
      conversationId: conversation.id,
      sessionId: conversation.sessionId,
      reply,
      fromCache,
      escalateHint:
        'If this did not resolve your issue, use Escalate to support to create a ticket for school staff.',
    });
  } catch (error: any) {
    console.error('[chatbot] chat error:', error);
    return res.status(500).json({ message: 'Helpdesk error', error: error?.message });
  }
};

/** GET /chatbot/conversations/:id/messages — own conversation or admin */
export const getConversationMessages = async (req: AuthRequest, res: Response) => {
  try {
    await ensureDb();
    const id = String(req.params.id || '');
    const sessionId = String(req.query.sessionId || '').trim();
    const convRepo = AppDataSource.getRepository(ChatbotConversation);
    const conversation = await convRepo.findOne({ where: { id } });
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

    const admin = isAdminUser(req);
    const owner =
      (req.user?.id && conversation.userId === req.user.id) ||
      (!!sessionId && conversation.sessionId === sessionId);
    if (!admin && !owner) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const messages = await AppDataSource.getRepository(ChatbotMessage).find({
      where: { conversationId: id },
      order: { createdAt: 'ASC' },
    });
    return res.json({ conversation, messages });
  } catch (error: any) {
    console.error('[chatbot] getConversationMessages:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** POST /chatbot/escalate */
export const escalate = async (req: AuthRequest, res: Response) => {
  try {
    await ensureDb();
    const subject = String(req.body?.subject || 'Helpdesk support request').trim().slice(0, 255);
    const description = sanitizeUserMessage(req.body?.description || req.body?.message || '');
    if (!description) {
      return res.status(400).json({ message: 'Please describe your issue' });
    }

    let sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) sessionId = `sess_${Date.now()}`;
    const role = resolveRole(req, req.body?.role);
    const userId = req.user?.id || null;
    const conversationId = req.body?.conversationId ? String(req.body.conversationId) : null;

    let conversation: ChatbotConversation | null = null;
    if (conversationId) {
      try {
        conversation = await getOrCreateConversation({
          conversationId,
          sessionId,
          userId,
          userRole: role,
          ip: clientIp(req),
        });
      } catch {
        conversation = null;
      }
    }

    const ticketRepo = AppDataSource.getRepository(ChatbotTicket);
    const ticket = await ticketRepo.save(
      ticketRepo.create({
        conversationId: conversation?.id || null,
        userId,
        userRole: role,
        subject: subject || 'Helpdesk support request',
        description,
        contactEmail: String(req.body?.contactEmail || req.user?.email || '').trim().slice(0, 255) || null,
        contactPhone: String(req.body?.contactPhone || '').trim().slice(0, 50) || null,
        status: 'open',
      })
    );

    return res.status(201).json({
      ticket,
      message: 'Support ticket created. School administrators will follow up.',
    });
  } catch (error: any) {
    console.error('[chatbot] escalate:', error);
    return res.status(500).json({ message: 'Failed to create ticket' });
  }
};

// ——— Admin FAQ CRUD ———

export const listFaqs = async (req: AuthRequest, res: Response) => {
  try {
    await ensureDb();
    const includeInactive = String(req.query.includeInactive || '') === '1' && isAdminUser(req);
    const repo = AppDataSource.getRepository(ChatbotFaq);
    const where = includeInactive ? {} : { isActive: true };
    const faqs = await repo.find({ where, order: { sortOrder: 'ASC', createdAt: 'ASC' } });
    return res.json(faqs);
  } catch (error: any) {
    console.error('[chatbot] listFaqs:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const createFaq = async (req: AuthRequest, res: Response) => {
  try {
    await ensureDb();
    if (!isAdminUser(req)) return res.status(403).json({ message: 'Admin access required' });

    const question = String(req.body?.question || '').trim().slice(0, 500);
    const answer = String(req.body?.answer || '').trim();
    if (!question || !answer) {
      return res.status(400).json({ message: 'Question and answer are required' });
    }

    const repo = AppDataSource.getRepository(ChatbotFaq);
    const faq = await repo.save(
      repo.create({
        question,
        answer,
        keywords: String(req.body?.keywords || '').trim() || null,
        category: String(req.body?.category || 'general').trim().slice(0, 100) || 'general',
        audience: String(req.body?.audience || 'all').trim().slice(0, 200) || 'all',
        sortOrder: Number(req.body?.sortOrder) || 0,
        isActive: req.body?.isActive !== false,
      })
    );
    return res.status(201).json(faq);
  } catch (error: any) {
    console.error('[chatbot] createFaq:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updateFaq = async (req: AuthRequest, res: Response) => {
  try {
    await ensureDb();
    if (!isAdminUser(req)) return res.status(403).json({ message: 'Admin access required' });

    const repo = AppDataSource.getRepository(ChatbotFaq);
    const faq = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!faq) return res.status(404).json({ message: 'FAQ not found' });

    if (req.body?.question != null) faq.question = String(req.body.question).trim().slice(0, 500);
    if (req.body?.answer != null) faq.answer = String(req.body.answer).trim();
    if (req.body?.keywords != null) faq.keywords = String(req.body.keywords).trim() || null;
    if (req.body?.category != null) faq.category = String(req.body.category).trim().slice(0, 100);
    if (req.body?.audience != null) faq.audience = String(req.body.audience).trim().slice(0, 200);
    if (req.body?.sortOrder != null) faq.sortOrder = Number(req.body.sortOrder) || 0;
    if (req.body?.isActive != null) faq.isActive = !!req.body.isActive;

    if (!faq.question || !faq.answer) {
      return res.status(400).json({ message: 'Question and answer are required' });
    }

    await repo.save(faq);
    return res.json(faq);
  } catch (error: any) {
    console.error('[chatbot] updateFaq:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const deleteFaq = async (req: AuthRequest, res: Response) => {
  try {
    await ensureDb();
    if (!isAdminUser(req)) return res.status(403).json({ message: 'Admin access required' });

    const repo = AppDataSource.getRepository(ChatbotFaq);
    const faq = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!faq) return res.status(404).json({ message: 'FAQ not found' });
    await repo.remove(faq);
    return res.json({ message: 'FAQ deleted' });
  } catch (error: any) {
    console.error('[chatbot] deleteFaq:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ——— Admin review ———

export const listConversations = async (req: AuthRequest, res: Response) => {
  try {
    await ensureDb();
    if (!isAdminUser(req)) return res.status(403).json({ message: 'Admin access required' });

    const take = Math.min(Number(req.query.limit) || 50, 200);
    const conversations = await AppDataSource.getRepository(ChatbotConversation).find({
      order: { updatedAt: 'DESC' },
      take,
    });
    return res.json(conversations);
  } catch (error: any) {
    console.error('[chatbot] listConversations:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const listTickets = async (req: AuthRequest, res: Response) => {
  try {
    await ensureDb();
    if (!isAdminUser(req)) return res.status(403).json({ message: 'Admin access required' });

    const status = String(req.query.status || '').trim();
    const repo = AppDataSource.getRepository(ChatbotTicket);
    const where = status && status !== 'all' ? { status: status as ChatbotTicketStatus } : {};
    const tickets = await repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return res.json(tickets);
  } catch (error: any) {
    console.error('[chatbot] listTickets:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updateTicket = async (req: AuthRequest, res: Response) => {
  try {
    await ensureDb();
    if (!isAdminUser(req)) return res.status(403).json({ message: 'Admin access required' });

    const repo = AppDataSource.getRepository(ChatbotTicket);
    const ticket = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    const allowed: ChatbotTicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
    if (req.body?.status && allowed.includes(req.body.status)) {
      ticket.status = req.body.status;
      if (req.body.status === 'resolved' || req.body.status === 'closed') {
        ticket.resolvedAt = new Date();
        ticket.resolvedByUserId = req.user?.id || null;
      }
    }
    if (req.body?.adminNotes != null) {
      ticket.adminNotes = String(req.body.adminNotes).trim().slice(0, 5000);
    }

    await repo.save(ticket);
    return res.json(ticket);
  } catch (error: any) {
    console.error('[chatbot] updateTicket:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const chatbotStatus = async (_req: AuthRequest, res: Response) => {
  return res.json({
    configured: isOpenAiConfigured(),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  });
};
