import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { TimetableEntry } from './TimetableEntry';
import { TimetableVersion } from './TimetableVersion';
import { TimetableConfig } from './TimetableConfig';

@Entity('timetables')
export class Timetable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  term: string;

  @Column()
  academicYear: string;

  @Column({ type: 'date', nullable: true })
  startDate: Date | null;

  @Column({ type: 'date', nullable: true })
  endDate: Date | null;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => TimetableConfig, { nullable: true })
  @JoinColumn({ name: 'configId' })
  config: TimetableConfig;

  @Column({ type: 'uuid', nullable: true })
  configId: string;

  @OneToMany(() => TimetableEntry, entry => entry.timetable, { cascade: true })
  entries: TimetableEntry[];

  @OneToMany(() => TimetableVersion, version => version.timetable, { cascade: true })
  versions: TimetableVersion[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

