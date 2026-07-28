import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { ChatbotMessage } from './ChatbotMessage';
import { ChatbotTicket } from './ChatbotTicket';

@Entity('chatbot_conversations')
@Index(['userId'])
@Index(['sessionId'])
@Index(['createdAt'])
export class ChatbotConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Authenticated user id when available */
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  /** Client-generated session id for guests / continuity */
  @Column({ type: 'varchar', length: 100 })
  sessionId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  userRole: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  clientIp: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  lastUserMessage: string | null;

  @Column({ type: 'int', default: 0 })
  messageCount: number;

  @OneToMany(() => ChatbotMessage, (m) => m.conversation)
  messages: ChatbotMessage[];

  @OneToMany(() => ChatbotTicket, (t) => t.conversation)
  tickets: ChatbotTicket[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
