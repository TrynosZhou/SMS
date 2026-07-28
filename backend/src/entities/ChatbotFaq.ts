import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('chatbot_faqs')
@Index(['isActive', 'category'])
@Index(['audience'])
export class ChatbotFaq {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 500 })
  question: string;

  @Column({ type: 'text' })
  answer: string;

  /** Comma/space separated keywords for retrieval */
  @Column({ type: 'text', nullable: true })
  keywords: string | null;

  /** e.g. admissions, fees, reports, account, general */
  @Column({ type: 'varchar', length: 100, default: 'general' })
  category: string;

  /**
   * Who this FAQ is relevant for.
   * Use 'all' or comma-separated roles: parent,student,teacher,admin,applicant,public
   */
  @Column({ type: 'varchar', length: 200, default: 'all' })
  audience: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
