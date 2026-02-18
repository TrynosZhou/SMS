import { Response } from 'express';
import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Student } from '../entities/Student';
import { Parent } from '../entities/Parent';
import { Teacher } from '../entities/Teacher';
import { User, UserRole } from '../entities/User';
import { Settings } from '../entities/Settings';
import { Message } from '../entities/Message';
import { AuthRequest } from '../middleware/auth';

export const sendBulkMessage = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    
    const { subject, message, recipients } = req.body;
    const user = req.user;

    // Check if user has permission (admin, superadmin, or accountant)
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin' && user.role !== 'accountant')) {
      return res.status(403).json({ message: 'You do not have permission to send bulk messages' });
    }

    if (!subject || !subject.trim()) {
      return res.status(400).json({ message: 'Subject/title is required' });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    if (!recipients || !['all', 'students', 'parents', 'teachers'].includes(recipients)) {
      return res.status(400).json({ message: 'Invalid recipients selection' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const parentRepository = AppDataSource.getRepository(Parent);
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const settingsRepository = AppDataSource.getRepository(Settings);

    // Get school name and headmaster name from settings
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    const schoolName = settings?.schoolName || 'School';
    const headmasterName = settings?.headmasterName || 'Headmaster';

    // Get recipients based on selection
    let recipientList: any[] = [];
    let recipientCount = 0;
    let studentCount = 0;
    let parentCount = 0;
    let teacherCount = 0;

    if (recipients === 'all' || recipients === 'students') {
      const students = await studentRepository.find({
        where: { isActive: true },
        relations: ['user']
      });
      students.forEach(student => {
        if (student.user?.email) {
          recipientList.push({
            email: student.user.email,
            name: `${student.firstName} ${student.lastName}`,
            type: 'student'
          });
          studentCount++;
        }
      });
    }

    if (recipients === 'all' || recipients === 'parents') {
      const parents = await parentRepository.find({
        relations: ['user']
      });
      parents.forEach(parent => {
        if (parent.user?.email) {
          recipientList.push({
            email: parent.user.email,
            name: `${parent.firstName} ${parent.lastName}`,
            type: 'parent'
          });
          parentCount++;
        }
      });
    }

    if (recipients === 'all' || recipients === 'teachers') {
      const teachers = await teacherRepository.find({
        where: { isActive: true },
        relations: ['user']
      });
      teachers.forEach(teacher => {
        if (teacher.user?.email) {
          recipientList.push({
            email: teacher.user.email,
            name: `${teacher.firstName} ${teacher.lastName}`,
            type: 'teacher'
          });
          teacherCount++;
        }
      });
    }

    recipientCount = recipientList.length;

    // Replace placeholders in message
    const processedMessage = message
      .replace(/\[School Name\]/g, schoolName)
      .replace(/\[Headmaster Name\]/g, headmasterName)
      .replace(/\[Recipient Name\]/g, '[Name]'); // Will be replaced per recipient

    // Get sender name
    const senderName = user.email || 'School Administration';

    // Save messages to database for parents if they are recipients
    const messageRepository = AppDataSource.getRepository(Message);
    let savedMessageCount = 0;
    let failedMessageCount = 0;
    
    if (recipients === 'all' || recipients === 'parents') {
      console.log('[sendBulkMessage] Saving messages to database for parents...');
      const parents = await parentRepository.find({
        relations: ['user']
      });
      
      console.log(`[sendBulkMessage] Found ${parents.length} parents in database`);
      
      // Create message records for each parent
      const messagePromises = parents.map(async (parent) => {
        try {
          // Only save if parent has an ID
          if (!parent.id) {
            console.warn(`[sendBulkMessage] Skipping parent without ID: ${parent.firstName} ${parent.lastName}`);
            return null;
          }
          
          // Replace [Recipient Name] with actual parent name
          const personalizedMessage = processedMessage.replace(/\[Name\]/g, `${parent.firstName} ${parent.lastName}`);
          
          const messageRecord = messageRepository.create({
            subject,
            message: personalizedMessage,
            recipients,
            senderId: user.id,
            senderName,
            parentId: parent.id,
            isRead: false
          });
          
          const saved = await messageRepository.save(messageRecord);
          console.log(`[sendBulkMessage] ✓ Saved message for parent: ${parent.firstName} ${parent.lastName} (ID: ${parent.id})`);
          return saved;
        } catch (error: any) {
          console.error(`[sendBulkMessage] ✗ Failed to save message for parent ${parent.firstName} ${parent.lastName}:`, error.message);
          failedMessageCount++;
          return null;
        }
      });
      
      const results = await Promise.all(messagePromises);
      savedMessageCount = results.filter(r => r !== null).length;
      console.log(`[sendBulkMessage] Successfully saved ${savedMessageCount} messages to database`);
      if (failedMessageCount > 0) {
        console.warn(`[sendBulkMessage] ⚠️  Failed to save ${failedMessageCount} messages`);
      }
    }

    // In a real implementation, you would:
    // 1. Send emails via an email service (e.g., SendGrid, AWS SES, Nodemailer)
    // 2. Handle email delivery status

    // For now, we'll simulate sending and return success
    // TODO: Implement actual email sending service
    console.log(`[sendBulkMessage] Bulk message processed`);
    console.log(`[sendBulkMessage] Subject: ${subject}`);
    console.log(`[sendBulkMessage] Recipients type: ${recipients}`);
    console.log(`[sendBulkMessage] Total recipients: ${recipientCount}`);
    console.log(`[sendBulkMessage] Students: ${studentCount}, Parents: ${parentCount}, Teachers: ${teacherCount}`);
    console.log(`[sendBulkMessage] Messages saved to database: ${savedMessageCount}`);
    if (failedMessageCount > 0) {
      console.log(`[sendBulkMessage] Failed saves: ${failedMessageCount}`);
    }

    // Build success message with details
    let successMessage: string;
    if (recipients === 'students') {
      successMessage = `Bulk message sent successfully to ${studentCount} student${studentCount === 1 ? '' : 's'}`;
    } else if (recipients === 'parents') {
      successMessage = `Bulk message sent successfully to ${parentCount} parent${parentCount === 1 ? '' : 's'}`;
    } else if (recipients === 'teachers') {
      successMessage = `Bulk message sent successfully to ${teacherCount} teacher${teacherCount === 1 ? '' : 's'}`;
    } else {
      successMessage = `Bulk message sent successfully to ${recipientCount} recipient${recipientCount === 1 ? '' : 's'} (${studentCount} student${studentCount === 1 ? '' : 's'}, ${parentCount} parent${parentCount === 1 ? '' : 's'}, ${teacherCount} teacher${teacherCount === 1 ? '' : 's'})`;
    }
    if (recipients === 'all' || recipients === 'parents') {
      if (savedMessageCount > 0) {
        successMessage += `. ${savedMessageCount} message(s) saved to parent inboxes.`;
      }
      if (failedMessageCount > 0) {
        successMessage += ` (${failedMessageCount} message(s) failed to save)`;
      }
    }

    res.json({
      success: true,
      message: successMessage,
      recipientCount,
      studentCount,
      parentCount,
      teacherCount,
      savedMessageCount: savedMessageCount > 0 ? savedMessageCount : undefined,
      failedMessageCount: failedMessageCount > 0 ? failedMessageCount : undefined,
      recipients: recipientList.length > 0 ? recipientList.slice(0, 10) : [], // Return first 10 as sample
      note: recipients === 'all' || recipients === 'parents' 
        ? 'Messages have been saved to parent inboxes and are now visible in their message center.'
        : 'In production, emails would be sent via email service. This is a simulation.'
    });
  } catch (error: any) {
    console.error('Error sending bulk message:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const sendMessageToSpecificParents = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const user = req.user;
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin' && user.role !== 'accountant')) {
      return res.status(403).json({ message: 'Access denied. Staff role required.' });
    }
    let { subject, message, parentIds } = req.body as { subject?: string; message?: string; parentIds?: string[] | string };
    if (!subject || !subject.trim()) {
      return res.status(400).json({ message: 'Subject is required' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message content is required' });
    }
    // Normalize parentIds from various field names and encodings
    const rawIds: any = parentIds ?? (req.body as any).parent_ids ?? (req.body as any).parents ?? (req.body as any).parentIds;
    let ids: string[] = [];
    if (Array.isArray(rawIds)) {
      ids = rawIds as string[];
    } else if (typeof rawIds === 'string') {
      // Could be comma-separated
      ids = rawIds.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      // Fallback: collect from repeated fields in form-data captured by body parser (e.g., parentIds[0], parentIds[1])
      ids = Object.keys(req.body)
        .filter(k => k.toLowerCase().includes('parent') && typeof (req.body as any)[k] === 'string')
        .map(k => ((req.body as any)[k] as string))
        .filter(v => /^[a-f0-9-]{8,}$/.test(v));
    }
    if (ids.length === 0) {
      return res.status(400).json({ message: 'At least one parentId is required' });
    }
    const parentRepository = AppDataSource.getRepository(Parent);
    const messageRepository = AppDataSource.getRepository(Message);
    const parents = await parentRepository.findBy({ id: In(ids) });
    if (parents.length === 0) {
      return res.status(404).json({ message: 'No matching parents found for provided IDs' });
    }
    // Prepare attachments, if any
    const files = (req as any).files as Express.Multer.File[] | undefined;
    let attachmentsJson: string | null = null;
    if (files && files.length > 0) {
      const urls = files.map(f => `/uploads/parent-messages/${f.filename}`);
      attachmentsJson = JSON.stringify(urls);
    }
    const records = parents.map(p => messageRepository.create({
      subject: subject!.trim(),
      message: message!.trim(),
      recipients: 'parent',
      senderId: user.id,
      senderName: user.email || 'School Staff',
      parentId: p.id,
      isRead: false,
      attachments: attachmentsJson
    }));
    await messageRepository.save(records);
    res.json({
      success: true,
      sent: records.length,
      parentCount: parents.length
    });
  } catch (error: any) {
    console.error('Error sending message to specific parents:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getParentMessages = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    
    const user = req.user;

    if (!user || user.role !== 'parent') {
      return res.status(403).json({ message: 'Access denied. Parent role required.' });
    }
    const parentRepository = AppDataSource.getRepository(Parent);
    const messageRepository = AppDataSource.getRepository(Message);

    // Find parent by user ID
    const parent = await parentRepository.findOne({
      where: { userId: user.id }
    });

    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }

    // Get all messages for this parent, ordered by most recent first
    const messages = await messageRepository.find({
      where: { parentId: parent.id },
      order: { createdAt: 'DESC' }
    });

    res.json({
      messages: messages.map(msg => ({
        id: msg.id,
        subject: msg.subject,
        message: msg.message,
        senderName: msg.senderName,
        createdAt: msg.createdAt,
        isRead: msg.isRead
      }))
    });
  } catch (error: any) {
    console.error('Error fetching parent messages:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getStaffMessages = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const user = req.user;
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin' && user.role !== 'accountant')) {
      return res.status(403).json({ message: 'Access denied. Staff role required.' });
    }

    const messageRepository = AppDataSource.getRepository(Message);
    const parentRepository = AppDataSource.getRepository(Parent);

    const box = (req.query.box as string | undefined)?.toLowerCase();

    let messages: Message[] = [];
    if ((user.role === 'admin' || user.role === 'superadmin') && box && ['accountant', 'admin', 'teacher'].includes(box)) {
      const userRepo = AppDataSource.getRepository(User);
      const roleMap: Record<string, UserRole> = {
        accountant: UserRole.ACCOUNTANT,
        admin: UserRole.ADMIN,
        teacher: UserRole.TEACHER
      };
      const requestedRole = roleMap[box];
      const senders = await userRepo.find({ where: { role: requestedRole } });
      const senderIds = senders.map(u => u.id);
      if (senderIds.length === 0) {
        return res.json([]);
      }
      messages = await messageRepository.find({
        where: senderIds.map(id => ({ senderId: id })),
        order: { createdAt: 'DESC' }
      });
    } else {
      messages = await messageRepository.find({
        where: { senderId: user.id },
        order: { createdAt: 'DESC' }
      });
    }

    const parentIds = Array.from(new Set(messages.map(m => m.parentId).filter(Boolean) as string[]));
    let parentsById: Record<string, Parent> = {};
    if (parentIds.length > 0) {
      const parents = await parentRepository.findBy({ id: In(parentIds) });
      parentsById = parents.reduce<Record<string, Parent>>((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {});
    }

    const result = messages.map(msg => {
      const parent = msg.parentId ? parentsById[msg.parentId] : undefined;
      return {
        id: msg.id,
        subject: msg.subject,
        message: msg.message,
        senderName: msg.senderName,
        recipientName: parent ? `${parent.firstName} ${parent.lastName}` : undefined,
        parentId: msg.parentId || undefined,
        createdAt: msg.createdAt,
        isRead: msg.isRead
      };
    });

    res.json({ messages: result });
  } catch (error: any) {
    console.error('Error fetching staff messages:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const sendParentMessage = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const user = req.user;
    if (!user || user.role !== 'parent') {
      return res.status(403).json({ message: 'Access denied. Parent role required.' });
    }
    const { subject, message, recipient } = req.body as { subject?: string; message?: string; recipient?: string };
    if (!subject || !subject.trim()) {
      return res.status(400).json({ message: 'Subject is required' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message content is required' });
    }
    const allowedRecipients = ['admin', 'accountant'];
    if (!recipient || !allowedRecipients.includes(recipient.toLowerCase())) {
      return res.status(400).json({ message: 'Recipient must be admin or accountant' });
    }
    const parentRepository = AppDataSource.getRepository(Parent);
    const messageRepository = AppDataSource.getRepository(Message);
    const parent = await parentRepository.findOne({ where: { userId: user.id } });
    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }
    const record = messageRepository.create({
      subject: subject.trim(),
      message: message.trim(),
      recipients: recipient.toLowerCase(),
      senderId: user.id,
      senderName: `${parent.firstName || ''} ${parent.lastName || ''}`.trim() || user.email || 'Parent',
      parentId: parent.id,
      isRead: false,
      attachments: Array.isArray((req as any).files) && (req as any).files.length > 0
        ? JSON.stringify(((req as any).files as any[]).map((f: any) => `/uploads/parent-messages/${f.filename}`))
        : null
    });
    const saved = await messageRepository.save(record);
    res.json({
      success: true,
      message: 'Message sent successfully',
      id: saved.id,
      createdAt: saved.createdAt,
      attachments: saved.attachments ? JSON.parse(saved.attachments) : []
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getParentOutbox = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const user = req.user;
    if (!user || user.role !== 'parent') {
      return res.status(403).json({ message: 'Access denied. Parent role required.' });
    }
    const messageRepository = AppDataSource.getRepository(Message);
    const messages = await messageRepository.find({
      where: { senderId: user.id },
      order: { createdAt: 'DESC' }
    });
    res.json({
      messages: messages.map(m => ({
        id: m.id,
        subject: m.subject,
        message: m.message,
        recipient: m.recipients,
        createdAt: m.createdAt,
        attachments: m.attachments ? JSON.parse(m.attachments) : []
      }))
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getParentOutboxById = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const user = req.user;
    if (!user || user.role !== 'parent') {
      return res.status(403).json({ message: 'Access denied. Parent role required.' });
    }
    const { id } = req.params as { id: string };
    const messageRepository = AppDataSource.getRepository(Message);
    const msg = await messageRepository.findOne({ where: { id } });
    if (!msg || msg.senderId !== user.id) {
      return res.status(404).json({ message: 'Message not found' });
    }
    res.json({
      id: msg.id,
      subject: msg.subject,
      message: msg.message,
      recipient: msg.recipients,
      createdAt: msg.createdAt,
      attachments: msg.attachments ? JSON.parse(msg.attachments) : []
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getIncomingFromParents = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const user = req.user;
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin' && user.role !== 'accountant')) {
      return res.status(403).json({ message: 'Access denied. Staff role required.' });
    }
    const boxRaw = (req.query.box as string | undefined)?.toLowerCase();
    const box = boxRaw && (boxRaw === 'admin' || boxRaw === 'accountant')
      ? boxRaw
      : (user.role === 'accountant' ? 'accountant' : 'admin');
    const messageRepository = AppDataSource.getRepository(Message);
    const parentRepository = AppDataSource.getRepository(Parent);
    const messages = await messageRepository.find({
      where: { recipients: box },
      order: { createdAt: 'DESC' }
    });
    const fromParents = messages.filter(m => !!m.parentId && !!m.senderId);
    const parentIds = Array.from(new Set(fromParents.map(m => m.parentId!).filter(Boolean)));
    let parentsById: Record<string, Parent> = {};
    if (parentIds.length > 0) {
      const parents = await parentRepository.findBy({ id: In(parentIds) });
      parentsById = parents.reduce<Record<string, Parent>>((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {});
    }
    const result = fromParents.map(m => {
      const parent = m.parentId ? parentsById[m.parentId] : undefined;
      return {
        id: m.id,
        subject: m.subject,
        message: m.message,
        senderName: m.senderName,
        parentName: parent ? `${parent.firstName} ${parent.lastName}` : 'Parent',
        createdAt: m.createdAt,
        attachments: m.attachments ? JSON.parse(m.attachments) : []
      };
    });
    res.json({ messages: result });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const markIncomingRead = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const user = req.user;
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin' && user.role !== 'accountant')) {
      return res.status(403).json({ message: 'Access denied. Staff role required.' });
    }
    const { id } = req.params as { id: string };
    const repo = AppDataSource.getRepository(Message);
    const msg = await repo.findOne({ where: { id } });
    if (!msg) {
      return res.status(404).json({ message: 'Message not found' });
    }
    msg.isRead = true;
    await repo.save(msg);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const markIncomingUnread = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const user = req.user;
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin' && user.role !== 'accountant')) {
      return res.status(403).json({ message: 'Access denied. Staff role required.' });
    }
    const { id } = req.params as { id: string };
    const repo = AppDataSource.getRepository(Message);
    const msg = await repo.findOne({ where: { id } });
    if (!msg) {
      return res.status(404).json({ message: 'Message not found' });
    }
    msg.isRead = false;
    await repo.save(msg);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const replyToIncomingMessage = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const user = req.user;
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin' && user.role !== 'accountant')) {
      return res.status(403).json({ message: 'Access denied. Staff role required.' });
    }
    const { id } = req.params as { id: string };
    const { subject, message } = req.body as { subject?: string; message?: string };
    if (!subject || !subject.trim()) {
      return res.status(400).json({ message: 'Subject is required' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message content is required' });
    }
    const repo = AppDataSource.getRepository(Message);
    const original = await repo.findOne({ where: { id } });
    if (!original || !original.parentId) {
      return res.status(404).json({ message: 'Original parent message not found' });
    }
    const record = repo.create({
      subject: subject.trim(),
      message: message.trim(),
      recipients: 'parent',
      senderId: user.id,
      senderName: user.email || 'School Staff',
      parentId: original.parentId,
      isRead: false,
      attachments: Array.isArray((req as any).files) && (req as any).files.length > 0
        ? JSON.stringify(((req as any).files as any[]).map((f: any) => `/uploads/parent-messages/${f.filename}`))
        : null
    });
    const saved = await repo.save(record);
    res.json({
      success: true,
      id: saved.id,
      createdAt: saved.createdAt
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

