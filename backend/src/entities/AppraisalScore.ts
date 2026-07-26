import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Appraisal } from './Appraisal';
import { AppraisalCriterion } from './AppraisalCriterion';

@Entity('appraisal_scores')
@Unique(['appraisalId', 'criterionId'])
@Index(['appraisalId'])
export class AppraisalScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  appraisalId: string;

  @ManyToOne(() => Appraisal, (a) => a.scores, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appraisalId' })
  appraisal: Appraisal;

  @Column({ type: 'uuid' })
  criterionId: string;

  @ManyToOne(() => AppraisalCriterion, (c) => c.scores, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'criterionId' })
  criterion: AppraisalCriterion;

  @Column({ type: 'numeric', precision: 8, scale: 2 })
  score: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;
}
