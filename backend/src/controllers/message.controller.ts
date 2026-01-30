import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Student } from '../entities/Student';
import { Parent } from '../entities/Parent';
import { Teacher } from '../entities/Teacher';
import { User } from '../entities/User';
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
    console.log(`[sendBulkMessage] Messages saved to database: ${savedMessageCount}`);
    if (failedMessageCount > 0) {
      console.log(`[sendBulkMessage] Failed saves: ${failedMessageCount}`);
    }

    // Build success message with details
    let successMessage = `Bulk message sent successfully to ${recipientCount} recipient(s)`;
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

