import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { PayrollEntry } from './PayrollEntry';

@Entity('payroll_runs')
export class PayrollRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' }) // 1-12
  month: number;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'varchar', default: 'draft' })
  status: 'draft' | 'approved';

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  totalGross: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  totalNet: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @OneToMany(() => PayrollEntry, pe => pe.payrollRun)
  entries: PayrollEntry[];
}
