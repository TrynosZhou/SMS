import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ChatbotConversation } from './ChatbotConversation';

export type ChatbotTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

@Entity('chatbot_tickets')
@Index(['status', 'createdAt'])
@Index(['userId'])
export class ChatbotTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  conversationId: string | null;

  @ManyToOne(() => ChatbotConversation, (c) => c.tickets, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'conversationId' })
  conversation: ChatbotConversation | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  userRole: string | null;

  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contactEmail: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  contactPhone: string | null;

  @Column({ type: 'varchar', length: 30, default: 'open' })
  status: ChatbotTicketStatus;

  @Column({ type: 'text', nullable: true })
  adminNotes: string | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedByUserId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
