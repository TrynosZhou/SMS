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
} from 'typeorm';
import { User } from './User';
import { Appraisal } from './Appraisal';
import { AppraisalGoal } from './AppraisalGoal';
import { AppraisalPeerAssignment } from './AppraisalPeerAssignment';

export enum AppraisalCycleStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  CLOSED = 'closed',
}

@Entity('appraisal_cycles')
export class AppraisalCycle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'enum', enum: AppraisalCycleStatus, default: AppraisalCycleStatus.DRAFT })
  status: AppraisalCycleStatus;

  /** Admin-configured composite weights per source type (percentages; should sum ~100). */
  @Column({ type: 'jsonb', nullable: true })
  sourceWeights: {
    self?: number;
    supervisor?: number;
    peer?: number;
    student?: number;
    parent?: number;
  } | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User | null;

  @OneToMany(() => Appraisal, (a) => a.cycle)
  appraisals: Appraisal[];

  @OneToMany(() => AppraisalGoal, (g) => g.cycle)
  goals: AppraisalGoal[];

  @OneToMany(() => AppraisalPeerAssignment, (p) => p.cycle)
  peerAssignments: AppraisalPeerAssignment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
