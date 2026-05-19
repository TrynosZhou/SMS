import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('timetable_configs')
export class TimetableConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: true })
  isActive: boolean;

  // Period configuration
  @Column({ type: 'integer', default: 14 })
  periodsPerDay: number;

  @Column({ type: 'time', default: '07:30:00' })
  schoolStartTime: string;

  @Column({ type: 'time', default: '16:10:00' })
  schoolEndTime: string;

  @Column({ type: 'integer', default: 35 }) // minutes - should always be set in config
  periodDuration: number;

  // Break periods
  @Column({ type: 'json', nullable: true })
  breakPeriods: Array<{
    name: string;
    startTime: string;
    endTime: string;
    periodAfter: number; // Which period this break comes after
  }>;

  // Days of week
  @Column({ type: 'json', default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] })
  daysOfWeek: string[];

  // Additional preferences
  @Column({ type: 'json', nullable: true })
  preferences: {
    allowDoublePeriods?: boolean;
    maxConsecutivePeriods?: number;
    preferredSubjectDistribution?: 'balanced' | 'concentrated';
    [key: string]: any;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

