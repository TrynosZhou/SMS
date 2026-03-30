import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToMany, JoinTable, ManyToOne, JoinColumn } from 'typeorm';
import { Student } from './Student';
import { Teacher } from './Teacher';
import { Subject } from './Subject';

@Entity('classes')
export class Class {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  form: string; // e.g., "Form 1", "Form 2"

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'uuid', nullable: true })
  classTeacher1Id: string | null;

  @ManyToOne(() => Teacher, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'classTeacher1Id' })
  classTeacher1: Teacher | null;

  @Column({ type: 'uuid', nullable: true })
  classTeacher2Id: string | null;

  @ManyToOne(() => Teacher, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'classTeacher2Id' })
  classTeacher2: Teacher | null;

  @OneToMany(() => Student, 'classEntity')
  students: Student[];

  @ManyToMany(() => Teacher, teacher => teacher.classes)
  teachers: Teacher[];

  @ManyToMany(() => Subject, subject => subject.classes)
  @JoinTable()
  subjects: Subject[];
}

