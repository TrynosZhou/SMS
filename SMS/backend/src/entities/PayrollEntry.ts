import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { PayrollRun } from './PayrollRun';
import { Teacher } from './Teacher';
import { AncillaryStaff } from './AncillaryStaff';
import { PayrollEntryLine } from './PayrollEntryLine';

@Entity('payroll_entries')
export class PayrollEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  payrollRunId: string;

  @Column({ type: 'uuid', nullable: true })
  teacherId: string | null;

  @Column({ type: 'uuid', nullable: true })
  ancillaryStaffId: string | null;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  grossSalary: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  totalAllowances: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  totalDeductions: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  netSalary: number;

  /** How salary is paid: cash, bank deposit, or both */
  @Column({ type: 'varchar', default: 'cash' })
  paymentMethod: 'cash' | 'bank' | 'both';

  /** Bank name (from settings.banks) when paymentMethod is bank or both */
  @Column({ type: 'varchar', nullable: true })
  bankName: string | null;

  @ManyToOne(() => PayrollRun, pr => pr.entries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payrollRunId' })
  payrollRun: PayrollRun;

  @ManyToOne(() => Teacher, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'teacherId' })
  teacher: Teacher | null;

  @ManyToOne(() => AncillaryStaff, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ancillaryStaffId' })
  ancillaryStaff: AncillaryStaff | null;

  @OneToMany(() => PayrollEntryLine, pel => pel.payrollEntry, { cascade: true })
  lines: PayrollEntryLine[];
}
