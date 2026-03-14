import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { SalaryAssignment } from './SalaryAssignment';

export interface SalaryComponent {
  name: string;
  type: 'basic' | 'allowance' | 'deduction';
  amount: number;
}

@Entity('salary_structures')
export class SalaryStructure {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'varchar' })
  employeeCategory: 'teacher' | 'ancillary';

  @Column({ type: 'json' })
  components: SalaryComponent[];

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @OneToMany(() => SalaryAssignment, sa => sa.salaryStructure)
  salaryAssignments: SalaryAssignment[];
}
