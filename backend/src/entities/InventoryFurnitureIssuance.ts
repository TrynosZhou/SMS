import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Student } from './Student';
import { User } from './User';
import { InventoryFurnitureItem } from './InventoryFurnitureItem';
export type FurnitureIssuanceStatus = 'active' | 'returned' | 'lost';

@Entity('inventory_furniture_issuances')
export class InventoryFurnitureIssuance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  furnitureItemId: string;

  @ManyToOne(() => InventoryFurnitureItem, f => f.issuances, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'furnitureItemId' })
  furnitureItem: InventoryFurnitureItem;

  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: FurnitureIssuanceStatus;

  @Column({ type: 'timestamp', nullable: true })
  returnedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lostReportedAt: Date | null;

  @Column({ type: 'uuid' })
  authorizedByUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'authorizedByUserId' })
  authorizedBy: User;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  issuedAt: Date;
}
