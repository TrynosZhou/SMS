import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity()
export class UserSessionLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  userId!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  username!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 32, nullable: true })
  role!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  sessionId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  deviceInfo!: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  loginAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  logoutAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastActivityAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  timeSpentSeconds!: number;

  @Column({ type: 'text', nullable: true })
  modules!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
