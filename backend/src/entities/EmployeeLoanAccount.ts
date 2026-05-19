import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Teacher } from './Teacher';
import { AncillaryStaff } from './AncillaryStaff';

@Entity('employee_loan_accounts')
@Index(['teacherId'], { unique: true, where: '"teacherId" IS NOT NULL' })
@Index(['ancillaryStaffId'], { unique: true, where: '"ancillaryStaffId" IS NOT NULL' })
export class EmployeeLoanAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  teacherId: string | null;

  @Column({ type: 'uuid', nullable: true })
  ancillaryStaffId: string | null;

  /** Outstanding loan balance (reduced when loan deduction is applied to a payslip) */
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  balance: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @ManyToOne(() => Teacher, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teacherId' })
  teacher: Teacher | null;

  @ManyToOne(() => AncillaryStaff, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ancillaryStaffId' })
  ancillaryStaff: AncillaryStaff | null;
}
