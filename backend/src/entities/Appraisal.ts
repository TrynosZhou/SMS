import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { Teacher } from './Teacher';
import { User } from './User';
import { AppraisalCycle } from './AppraisalCycle';
import { AppraisalScore } from './AppraisalScore';

export enum AppraisalSourceType {
  SELF = 'self',
  SUPERVISOR = 'supervisor',
  PEER = 'peer',
  STUDENT = 'student',
  PARENT = 'parent',
}

export enum AppraisalStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  REVIEWED = 'reviewed',
  FINALIZED = 'finalized',
}

@Entity('appraisals')
@Unique(['teacherId', 'cycleId', 'sourceType', 'evaluatorId'])
@Index(['teacherId', 'cycleId'])
@Index(['cycleId', 'sourceType'])
export class Appraisal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  teacherId: string;

  @ManyToOne(() => Teacher, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teacherId' })
  teacher: Teacher;

  @Column({ type: 'uuid' })
  cycleId: string;

  @ManyToOne(() => AppraisalCycle, (c) => c.appraisals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cycleId' })
  cycle: AppraisalCycle;

  /** Null for anonymous-style student/parent entries when evaluator user is not stored. */
  @Column({ type: 'uuid', nullable: true })
  evaluatorId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'evaluatorId' })
  evaluator: User | null;

  @Column({ type: 'enum', enum: AppraisalSourceType })
  sourceType: AppraisalSourceType;

  @Column({ type: 'enum', enum: AppraisalStatus, default: AppraisalStatus.PENDING })
  status: AppraisalStatus;

  /** Weighted average of criterion scores (0–scaleMax), nullable until scores exist. */
  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true })
  overallScore: number | null;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @OneToMany(() => AppraisalScore, (s) => s.appraisal, { cascade: true })
  scores: AppraisalScore[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
