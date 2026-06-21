import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Invoice } from './Invoice';
import { Student } from './Student';

@Entity('payment_logs')
@Index(['invoiceId', 'createdAt'])
export class PaymentLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Invoice)
  @JoinColumn({ name: 'invoiceId' })
  invoice: Invoice;

  @Column()
  invoiceId: string;

  @ManyToOne(() => Student)
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column()
  studentId: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amountPaid: number;

  @Column({ type: 'timestamp' })
  paymentDate: Date;

  @Column({ type: 'varchar', nullable: true })
  paymentMethod: string | null;

  @Column({ type: 'varchar', nullable: true })
  receiptNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  payerUserId: string | null;

  @Column({ type: 'varchar', nullable: true })
  payerName: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** When set, this payment was voided via admin remediation (original row kept for audit). */
  @Column({ type: 'timestamp', nullable: true })
  reversedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  reversedByUserId: string | null;

  /** On the original payment: id of the compensating reversal log. */
  @Column({ type: 'varchar', nullable: true })
  reversalPaymentLogId: string | null;

  /** On a reversal log: id of the payment being reversed. */
  @Column({ type: 'varchar', nullable: true })
  reversesPaymentLogId: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
