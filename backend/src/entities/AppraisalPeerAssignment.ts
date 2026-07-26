import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import { Teacher } from './Teacher';
import { AppraisalCycle } from './AppraisalCycle';

@Entity('appraisal_peer_assignments')
@Unique(['cycleId', 'evaluatorTeacherId', 'targetTeacherId'])
@Index(['cycleId', 'evaluatorTeacherId'])
export class AppraisalPeerAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  cycleId: string;

  @ManyToOne(() => AppraisalCycle, (c) => c.peerAssignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cycleId' })
  cycle: AppraisalCycle;

  /** Teacher who performs the peer review. */
  @Column({ type: 'uuid' })
  evaluatorTeacherId: string;

  @ManyToOne(() => Teacher, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'evaluatorTeacherId' })
  evaluatorTeacher: Teacher;

  /** Teacher being reviewed. */
  @Column({ type: 'uuid' })
  targetTeacherId: string;

  @ManyToOne(() => Teacher, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'targetTeacherId' })
  targetTeacher: Teacher;

  @CreateDateColumn()
  createdAt: Date;
}
