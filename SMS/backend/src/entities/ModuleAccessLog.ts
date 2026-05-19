import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity()
export class ModuleAccessLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  userId!: string;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  sessionId!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  username!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  role!: string | null;

  @Column({ type: 'varchar', length: 128 })
  module!: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  route!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  userAgent!: string | null;

  @CreateDateColumn()
  accessedAt!: Date;
}
