import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Teacher } from './Teacher';
import { AppraisalCycle } from './AppraisalCycle';

export enum AppraisalGoalStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in-progress',
  ACHIEVED = 'achieved',
  MISSED = 'missed',
}

@Entity('appraisal_goals')
@Index(['teacherId', 'cycleId'])
export class AppraisalGoal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  teacherId: string;

  @ManyToOne(() => Teacher, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teacherId' })
  teacher: Teacher;

  @Column({ type: 'uuid' })
  cycleId: string;

  @ManyToOne(() => AppraisalCycle, (c) => c.goals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cycleId' })
  cycle: AppraisalCycle;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: AppraisalGoalStatus, default: AppraisalGoalStatus.OPEN })
  status: AppraisalGoalStatus;

  @Column({ type: 'uuid', nullable: true })
  followUpCycleId: string | null;

  @ManyToOne(() => AppraisalCycle, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'followUpCycleId' })
  followUpCycle: AppraisalCycle | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
