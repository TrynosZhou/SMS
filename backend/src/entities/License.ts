import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { School } from './School';
import { LicenseTier } from './LicenseTier';

@Entity('licenses')
@Index(['schoolId', 'isActive'])
export class License {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @Column({ type: 'uuid' })
  tierId: string;

  @ManyToOne(() => LicenseTier, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tierId' })
  tier: LicenseTier;

  @Column({ type: 'date' })
  validFrom: string;

  @Column({ type: 'date', nullable: true })
  validUntil: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
