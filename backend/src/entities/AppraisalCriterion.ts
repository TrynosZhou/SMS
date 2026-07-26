import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { AppraisalScore } from './AppraisalScore';

@Entity('appraisal_criteria')
@Index(['isActive'])
export class AppraisalCriterion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Relative weight within an appraisal (e.g. 1–10). */
  @Column({ type: 'numeric', precision: 8, scale: 2, default: 1 })
  weight: number;

  @Column({ type: 'int', default: 1 })
  scaleMin: number;

  @Column({ type: 'int', default: 5 })
  scaleMax: number;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => AppraisalScore, (s) => s.criterion)
  scores: AppraisalScore[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
