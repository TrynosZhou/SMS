import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { Student } from './Student';
import { InvoiceUniformItem } from './InvoiceUniformItem';

export enum InvoiceStatus {
  PENDING = 'pending',
  PAID = 'paid',
  PARTIAL = 'partial',
  OVERDUE = 'overdue',
  VOID = 'void'
}

@Entity('invoices')
@Index(['invoiceNumber'], { unique: true })
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  invoiceNumber: string;

  @ManyToOne(() => Student, student => student.invoices)
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column()
  studentId: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  paidAmount: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  balance: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  previousBalance: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  prepaidAmount: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  uniformTotal: number;

  // Canonical fee components for this invoice (non-uniform):
  // these are used by invoice/receipt PDFs and reports instead of
  // re-parsing Settings or description text.
  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  tuitionAmount: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  transportAmount: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  diningHallAmount: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  registrationAmount: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  deskFeeAmount: number;

  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    default: InvoiceStatus.PENDING
  })
  status: InvoiceStatus;

  @Column({ type: 'date' })
  dueDate: Date;

  @Column({ type: 'varchar' })
  term: string; // e.g., "Term 1 2024"

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @OneToMany(() => InvoiceUniformItem, uniformItem => uniformItem.invoice, { cascade: ['insert'], eager: true })
  uniformItems: InvoiceUniformItem[];

  @Column({ type: 'boolean', default: false })
  isVoided: boolean;

  @Column({ type: 'text', nullable: true })
  voidReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  voidedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  voidByAdminId: string | null;
}

