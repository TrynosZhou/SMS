import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToMany, JoinTable, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Student } from './Student';
import { Teacher } from './Teacher';
import { Subject } from './Subject';
import { School } from './School';

@Entity('classes')
@Index(['name', 'schoolId'], { unique: true })
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

  @OneToMany(() => Student, student => student.class)
  students: Student[];

  @ManyToMany(() => Teacher, teacher => teacher.classes)
  teachers: Teacher[];

  @ManyToMany(() => Subject, subject => subject.classes)
  @JoinTable()
  subjects: Subject[];

  @ManyToOne(() => School, school => school.classes, { nullable: false })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @Column({ type: 'uuid' })
  schoolId: string;
}

