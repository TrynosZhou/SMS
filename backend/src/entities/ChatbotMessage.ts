import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ChatbotConversation } from './ChatbotConversation';

export type ChatbotMessageRole = 'user' | 'assistant' | 'system';

@Entity('chatbot_messages')
@Index(['conversationId', 'createdAt'])
export class ChatbotMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => ChatbotConversation, (c) => c.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: ChatbotConversation;

  @Column({ type: 'varchar', length: 20 })
  role: ChatbotMessageRole;

  @Column({ type: 'text' })
  content: string;

  /** Whether response came from FAQ cache (no OpenAI call) */
  @Column({ default: false })
  fromCache: boolean;

  @Column({ type: 'int', nullable: true })
  promptTokens: number | null;

  @Column({ type: 'int', nullable: true })
  completionTokens: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
