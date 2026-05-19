import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Teacher } from './Teacher';
import { AncillaryStaff } from './AncillaryStaff';

/** Per-loan schedule: total (P+I), tenure in months, amount paid so far. Used for equal installments (1/2/3 months). */
@Entity('loan_schedules')
@Index(['teacherId'])
@Index(['ancillaryStaffId'])
export class LoanSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  teacherId: string | null;

  @Column({ type: 'uuid', nullable: true })
  ancillaryStaffId: string | null;

  /** Total repayment amount (principal + interest) for this loan. */
  @Column('decimal', { precision: 12, scale: 2 })
  totalAmount: number;

  /** Repayment tenure: 1, 2, or 3 months. */
  @Column('int')
  tenureMonths: number;

  /** Amount repaid so far (increases each payroll deduction). */
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  amountPaid: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ManyToOne(() => Teacher, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teacherId' })
  teacher: Teacher | null;

  @ManyToOne(() => AncillaryStaff, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ancillaryStaffId' })
  ancillaryStaff: AncillaryStaff | null;
}
