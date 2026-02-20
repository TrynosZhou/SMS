import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';
import { Parent } from './Parent';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar' })
  recipients: string; // 'all', 'students', 'parents', 'teachers'

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'senderId' })
  sender: User;

  @Column({ nullable: true })
  senderId: string;

  @Column({ nullable: true })
  senderName: string;

  @ManyToOne(() => Parent, { nullable: true })
  @JoinColumn({ name: 'parentId' })
  parent: Parent;

  @Column({ nullable: true })
  parentId: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ default: false })
  isRead: boolean;

  @Column({ type: 'text', nullable: true })
  attachments: string | null;

  @Column({ type: 'varchar', default: 'sent' })
  status: string;

  @Column({ type: 'text', nullable: true })
  failedReason: string | null;
}

