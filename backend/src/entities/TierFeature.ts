import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { LicenseTier } from './LicenseTier';
import { Feature } from './Feature';
import { User } from './User';

@Entity('tier_features')
@Unique(['tierId', 'featureId'])
@Index(['tierId'])
@Index(['featureId'])
export class TierFeature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tierId: string;

  @ManyToOne(() => LicenseTier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tierId' })
  tier: LicenseTier;

  @Column({ type: 'uuid' })
  featureId: string;

  @ManyToOne(() => Feature, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'featureId' })
  feature: Feature;

  @CreateDateColumn()
  grantedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  grantedBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'grantedBy' })
  grantedByUser: User | null;
}
