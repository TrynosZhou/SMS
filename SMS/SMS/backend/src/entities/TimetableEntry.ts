import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Timetable } from './Timetable';
import { Class } from './Class';
import { Teacher } from './Teacher';
import { Subject } from './Subject';

@Entity('timetable_entries')
export class TimetableEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  day: string; // Monday, Tuesday, etc.

  @Column()
  period: string; // Period ID or number

  @Column({ nullable: true })
  room: string;

  @ManyToOne(() => Timetable, timetable => timetable.entries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'timetableId' })
  timetable: Timetable;

  @Column()
  timetableId: string;

  @ManyToOne(() => Class, { nullable: true })
  @JoinColumn({ name: 'classId' })
  class: Class;

  @Column({ nullable: true })
  classId: string;

  @ManyToOne(() => Teacher, { nullable: true })
  @JoinColumn({ name: 'teacherId' })
  teacher: Teacher;

  @Column({ nullable: true })
  teacherId: string;

  @ManyToOne(() => Subject, { nullable: true })
  @JoinColumn({ name: 'subjectId' })
  subject: Subject;

  @Column({ nullable: true })
  subjectId: string;

  @Column({ default: false })
  isLocked: boolean; // If true, this entry cannot be moved during regeneration
}

