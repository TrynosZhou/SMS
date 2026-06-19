import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './User';

export enum CashbookEntryType {
  RECEIPT = 'receipt',
  PAYMENT = 'payment',
}

@Entity('cashbook_entries')
@Index(['entryDate', 'createdAt'])
export class CashbookEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  entryDate: Date;

  @Column({ type: 'varchar' })
  type: CashbookEntryType;

  @Column({ type: 'text' })
  description: string;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  moneyIn: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  moneyOut: number;

  @Column({ type: 'varchar', nullable: true })
  paymentMethod: string | null;

  @Column({ type: 'varchar', nullable: true })
  reference: string | null;

  @Column({ type: 'varchar', default: 'manual' })
  source: string;

  @Column({ type: 'varchar', nullable: true })
  paymentLogId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdById' })
  createdBy: User | null;

  @Column({ type: 'varchar', nullable: true })
  createdById: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
