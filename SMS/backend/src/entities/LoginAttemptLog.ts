import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity()
export class LoginAttemptLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  username!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  role!: string | null;

  @Column({ type: 'boolean', default: false })
  success!: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  deviceInfo!: string | null;

  @CreateDateColumn()
  attemptedAt!: Date;
}
