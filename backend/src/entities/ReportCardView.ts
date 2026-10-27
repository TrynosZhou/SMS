import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
  CreateDateColumn
} from 'typeorm';
import { Parent } from './Parent';
import { Student } from './Student';

/**
 * Records that a parent has accessed (viewed) a specific child's report card
 * for a given exam type and term. Used by the admin "Report Cards" outreach
 * tool to surface parents who have not yet viewed their linked children's
 * report cards.
 *
 * A row is created (upserted) when a PARENT requests a report card via the
 * `getReportCard` controller. One row per (parentId, studentId, examType, term).
 */
@Entity('report_card_views')
@Unique(['parentId', 'studentId', 'examType', 'term'])
export class ReportCardView {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Parent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parentId' })
  parent: Parent;

  @Column()
  @Index()
  parentId: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column()
  @Index()
  studentId: string;

  /** Exam type as stored on the Exam entity (e.g. 'mid_term', 'end_term'). */
  @Column({ type: 'varchar' })
  examType: string;

  /** Academic term (e.g. 'Term 1'). */
  @Column({ type: 'varchar' })
  term: string;

  /** User that performed the view (the parent's user id). Nullable for safety. */
  @Column({ nullable: true })
  viewerUserId: string | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  viewedAt: Date;
}
