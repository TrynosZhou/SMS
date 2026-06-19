import { AppDataSource } from '../config/database';
import { Message } from '../entities/Message';
import { Parent } from '../entities/Parent';
import { User, UserRole } from '../entities/User';

export interface ParentRegistrationNotificationInput {
  user: User;
  parent: Parent;
}

async function findSystemAdminUser(): Promise<User | null> {
  const userRepository = AppDataSource.getRepository(User);
  const superadmin = await userRepository.findOne({
    where: { role: UserRole.SUPERADMIN, isActive: true },
    order: { createdAt: 'ASC' },
  });
  if (superadmin) {
    return superadmin;
  }
  return userRepository.findOne({
    where: { role: UserRole.ADMIN, isActive: true },
    order: { createdAt: 'ASC' },
  });
}

function buildParentDisplayName(user: User, parent: Parent): string {
  const fromParent = `${parent.firstName || ''} ${parent.lastName || ''}`.trim();
  if (fromParent) {
    return fromParent;
  }
  const fromUser = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return fromUser || user.username || 'Parent';
}

/**
 * After a parent self-registers, notify administrators (incoming messages)
 * and send a welcome message to the parent inbox with next-step guidance.
 */
export async function sendParentRegistrationNotifications(
  input: ParentRegistrationNotificationInput
): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const { user, parent } = input;
  const messageRepository = AppDataSource.getRepository(Message);
  const parentName = buildParentDisplayName(user, parent);
  const email = String(parent.email || user.email || '').trim() || 'Not provided';
  const phone = String(parent.phoneNumber || '').trim() || 'Not provided';
  const address = String(parent.address || '').trim() || 'Not provided';

  const adminNotice = messageRepository.create({
    subject: 'New parent account registered',
    message:
      `A new parent account has been created on the portal.\n\n` +
      `Name: ${parentName}\n` +
      `Email: ${email}\n` +
      `Phone: ${phone}\n` +
      `Address: ${address}\n` +
      `Username: ${user.username}\n\n` +
      `Please review the parent record in Parent Management and link student(s) if required.`,
    recipients: 'admin',
    senderId: user.id,
    senderName: parentName,
    parentId: parent.id,
    isRead: false,
    status: 'sent',
  });
  await messageRepository.save(adminNotice);

  const systemAdmin = await findSystemAdminUser();
  const welcomeMessage = messageRepository.create({
    subject: 'Welcome — your parent account is ready',
    message:
      `Dear ${parentName},\n\n` +
      `Your parent portal account has been created successfully.\n\n` +
      `Next steps:\n` +
      `1. Sign in to the parent portal using your username and password.\n` +
      `2. Link your account to your child(ren) by entering each Student ID in the portal.\n` +
      `3. After linking, you can view student records, fees, messages, and other updates from the school.\n\n` +
      `If you need assistance, please contact the school administration.\n\n` +
      `Thank you.`,
    recipients: 'parent',
    senderId: systemAdmin?.id || null,
    senderName: 'School Administration',
    parentId: parent.id,
    isRead: false,
    status: 'sent',
  });
  await messageRepository.save(welcomeMessage);
}
