import { Entity, Column, PrimaryColumn } from 'typeorm';

/** Per-student preference for whether marks count toward class pass rate (mark sheet / reports). */
@Entity('exam_student_pass_rate_inclusion')
export class ExamStudentPassRateInclusion {
  @PrimaryColumn('uuid')
  examId: string;

  @PrimaryColumn('uuid')
  studentId: string;

  @Column({ type: 'boolean', default: true })
  includeInClassPassRate: boolean;
}
