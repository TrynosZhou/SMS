import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { PayrollEntry } from './PayrollEntry';

@Entity('payroll_entry_lines')
export class PayrollEntryLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  payrollEntryId: string;

  @Column()
  componentName: string;

  @Column({ type: 'varchar' })
  componentType: 'basic' | 'allowance' | 'deduction';

  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @ManyToOne(() => PayrollEntry, pe => pe.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payrollEntryId' })
  payrollEntry: PayrollEntry;
}
