import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { InventoryFurnitureIssuance } from './InventoryFurnitureIssuance';

export type InventoryFurnitureType = 'desk' | 'chair';

@Entity('inventory_furniture_items')
export class InventoryFurnitureItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16 })
  itemType: InventoryFurnitureType;

  /** Human-visible asset tag */
  @Column({ type: 'varchar', unique: true })
  itemCode: string;

  @Column({ type: 'varchar', default: 'good' })
  condition: string;

  @Column({ type: 'varchar', nullable: true })
  locationLabel: string | null;

  @Column({ type: 'varchar', default: 'available' })
  status: 'available' | 'issued' | 'damaged' | 'lost';

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @OneToMany(() => InventoryFurnitureIssuance, i => i.furnitureItem)
  issuances: InventoryFurnitureIssuance[];
}
