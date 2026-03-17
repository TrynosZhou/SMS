import { Entity, PrimaryGeneratedColumn, Column, OneToMany, Index } from 'typeorm';
import { SalaryAssignment } from './SalaryAssignment';
import { PayrollEntry } from './PayrollEntry';

@Entity('ancillary_staff')
@Index(['employeeId'], { unique: true })
export class AncillaryStaff {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  employeeId: string;

  @Column({ nullable: true })
  nationalId: string | null;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  role: string | null;

  @Column({ nullable: true })
  designation: string | null;

  @Column({ nullable: true })
  department: string | null;

  @Column({ type: 'varchar', default: 'monthly' })
  salaryType: 'monthly' | 'daily';

  @Column({ nullable: true })
  bankName: string | null;

  @Column({ nullable: true })
  bankAccountNumber: string | null;

  @Column({ nullable: true })
  bankBranch: string | null;

  /** How salary is paid: cash, bank, or both */
  @Column({ type: 'varchar', default: 'cash' })
  paymentMethod: 'cash' | 'bank' | 'both';

  @Column({ type: 'varchar', default: 'active' })
  employmentStatus: 'active' | 'terminated';

  @Column({ nullable: true })
  phoneNumber: string | null;

  @Column({ type: 'date', nullable: true })
  dateJoined: Date | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @OneToMany(() => SalaryAssignment, sa => sa.ancillaryStaff)
  salaryAssignments: SalaryAssignment[];

  @OneToMany(() => PayrollEntry, pe => pe.ancillaryStaff)
  payrollEntries: PayrollEntry[];
}
