import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ElearningTask } from './ElearningTask';
import { Student } from './Student';

@Entity('elearning_responses')
export class ElearningResponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ElearningTask, task => task.id, { eager: true })
  @JoinColumn({ name: 'taskId' })
  task: ElearningTask;

  @Column()
  taskId: string;

  @ManyToOne(() => Student, student => student.id, { eager: true })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column()
  studentId: string;

  @Column({ type: 'text', nullable: true })
  text: string | null;

  @Column({ type: 'varchar', nullable: true })
  fileUrl: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  submittedAt: Date;
}

