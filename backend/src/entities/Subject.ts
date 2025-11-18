import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, Index } from 'typeorm';
import { Teacher } from './Teacher';
import { Class } from './Class';
import { Exam } from './Exam';

@Entity('subjects')
@Index(['code'], { unique: true })
export class Subject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  code: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @ManyToMany(() => Teacher, teacher => teacher.subjects)
  teachers: Teacher[];

  @ManyToMany(() => Class, classEntity => classEntity.subjects)
  classes: Class[];

  @ManyToMany(() => Exam, exam => exam.subjects)
  exams: Exam[];
}

