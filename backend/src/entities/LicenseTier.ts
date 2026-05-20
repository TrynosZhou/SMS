import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('license_tiers')
export class LicenseTier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stable slug: gold | bronze | platinum */
  @Column({ type: 'varchar', length: 32, unique: true })
  tierName: string;

  @Column({ type: 'varchar', length: 64 })
  displayName: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
