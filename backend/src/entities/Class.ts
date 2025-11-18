import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToMany, JoinTable, Index } from 'typeorm';
import { Student } from './Student';
import { Teacher } from './Teacher';
import { Subject } from './Subject';

@Entity('classes')
@Index(['name'], { unique: true })
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

  @OneToMany(() => Student, 'classEntity')
  students: Student[];

  @ManyToMany(() => Teacher, teacher => teacher.classes)
  teachers: Teacher[];

  @ManyToMany(() => Subject, subject => subject.classes)
  @JoinTable()
  subjects: Subject[];
}

