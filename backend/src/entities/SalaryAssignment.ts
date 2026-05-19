import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Teacher } from './Teacher';
import { AncillaryStaff } from './AncillaryStaff';
import { SalaryStructure, SalaryComponent } from './SalaryStructure';

@Entity('salary_assignments')
@Index(['teacherId', 'effectiveFrom'], { unique: true, where: '"teacherId" IS NOT NULL' })
@Index(['ancillaryStaffId', 'effectiveFrom'], { unique: true, where: '"ancillaryStaffId" IS NOT NULL' })
export class SalaryAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  teacherId: string | null;

  @Column({ type: 'uuid', nullable: true })
  ancillaryStaffId: string | null;

  @Column()
  salaryStructureId: string;

  @Column({ type: 'date' })
  effectiveFrom: Date;

  /** Per-employee negotiated amounts. When set, payroll uses these instead of structure default. */
  @Column({ type: 'json', nullable: true })
  customComponents: SalaryComponent[] | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ManyToOne(() => Teacher, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teacherId' })
  teacher: Teacher | null;

  @ManyToOne(() => AncillaryStaff, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ancillaryStaffId' })
  ancillaryStaff: AncillaryStaff | null;

  @ManyToOne(() => SalaryStructure, ss => ss.salaryAssignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'salaryStructureId' })
  salaryStructure: SalaryStructure;
}
