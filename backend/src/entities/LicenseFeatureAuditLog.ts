import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { LicenseTier } from './LicenseTier';
import { Feature } from './Feature';
import { User } from './User';

export type LicenseAuditAction =
  | 'feature_created'
  | 'feature_updated'
  | 'feature_deactivated'
  | 'tier_feature_granted'
  | 'tier_feature_revoked'
  | 'school_license_updated';

@Entity('license_feature_audit_log')
@Index(['createdAt'])
export class LicenseFeatureAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  action: LicenseAuditAction;

  @Column({ type: 'uuid', nullable: true })
  tierId: string | null;

  @ManyToOne(() => LicenseTier, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tierId' })
  tier: LicenseTier | null;

  @Column({ type: 'uuid', nullable: true })
  featureId: string | null;

  @ManyToOne(() => Feature, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'featureId' })
  feature: Feature | null;

  @Column({ type: 'uuid', nullable: true })
  performedBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'performedBy' })
  performer: User | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
