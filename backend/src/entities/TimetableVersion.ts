import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn } from 'typeorm';
import { Timetable } from './Timetable';
import { TimetableChangeLog } from './TimetableChangeLog';

@Entity('timetable_versions')
export class TimetableVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Timetable, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'timetableId' })
  timetable: Timetable;

  @Column()
  timetableId: string;

  @Column()
  versionNumber: number;

  @Column({ nullable: true })
  description: string;

  @Column({ default: false })
  isActive: boolean;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string; // User ID who created this version

  @OneToMany(() => TimetableChangeLog, changeLog => changeLog.version, { cascade: true })
  changeLogs: TimetableChangeLog[];

  @CreateDateColumn()
  createdAt: Date;
}

