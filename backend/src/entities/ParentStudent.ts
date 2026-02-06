import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique, Index } from 'typeorm';
import { Parent } from './Parent';
import { Student } from './Student';

@Entity('parent_students')
@Unique(['parentId', 'studentId'])
export class ParentStudent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Parent, parent => parent.parentStudents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parentId' })
  parent: Parent;

  @Column()
  @Index()
  parentId: string;

  @ManyToOne(() => Student, student => student.parentStudents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column()
  @Index()
  studentId: string;

  @Column({ type: 'varchar', default: 'guardian' })
  relationshipType: string;
}

