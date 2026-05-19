import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Class } from './Class';
import { Teacher } from './Teacher';
import { Student } from './Student';

export enum ElearningTaskType {
  ASSIGNMENT = 'assignment',
  TEST = 'test',
  NOTES = 'notes'
}

@Entity('elearning_tasks')
export class ElearningTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ElearningTaskType })
  type: ElearningTaskType;

  @Column({ type: 'varchar', nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'date', nullable: true })
  dueDate: Date | null;

  @Column({ type: 'varchar', nullable: true })
  fileUrl: string | null;

  @ManyToOne(() => Class, cls => cls.id, { eager: true })
  @JoinColumn({ name: 'classId' })
  classEntity: Class;

  @Column()
  classId: string;

  @ManyToOne(() => Teacher, teacher => teacher.id, { eager: true })
  @JoinColumn({ name: 'teacherId' })
  teacher: Teacher;

  @Column()
  teacherId: string;

  // Optional: target a single student; if null, applies to whole class
  @ManyToOne(() => Student, student => student.id, { eager: true, nullable: true })
  @JoinColumn({ name: 'studentId' })
  student: Student | null;

  @Column({ type: 'uuid', nullable: true })
  studentId: string | null;

  // Optional maximum score/marks for this task (e.g. 10, 20, 30).
  @Column({ type: 'int', nullable: true })
  maxScore: number | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}

