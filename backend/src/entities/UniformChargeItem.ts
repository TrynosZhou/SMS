import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { UniformCharge } from './UniformCharge';

@Entity('uniform_charge_items')
export class UniformChargeItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => UniformCharge, charge => charge.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'uniformChargeId' })
  uniformCharge: UniformCharge;

  @Column()
  uniformChargeId: string;

  @Column({ type: 'varchar', length: 150 })
  itemName: string;

  @Column('decimal', { precision: 10, scale: 2 })
  unitPrice: number;

  @Column('int')
  quantity: number;

  @Column('decimal', { precision: 10, scale: 2 })
  lineTotal: number;
}
