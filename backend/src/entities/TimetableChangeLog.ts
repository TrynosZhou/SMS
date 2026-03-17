import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { TimetableVersion } from './TimetableVersion';

@Entity('timetable_change_logs')
export class TimetableChangeLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => TimetableVersion, version => version.changeLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'versionId' })
  version: TimetableVersion;

  @Column()
  versionId: string;

  @Column()
  action: 'create' | 'update' | 'delete' | 'move' | 'swap';

  @Column({ type: 'json' })
  oldValue: {
    day?: string;
    period?: string;
    classId?: string;
    teacherId?: string;
    subjectId?: string;
    room?: string;
  };

  @Column({ type: 'json' })
  newValue: {
    day?: string;
    period?: string;
    classId?: string;
    teacherId?: string;
    subjectId?: string;
    room?: string;
  };

  @Column({ type: 'uuid' })
  changedBy: string; // User ID

  @Column({ nullable: true })
  reason: string;

  @CreateDateColumn()
  createdAt: Date;
}

