import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';
import { InventoryFurnitureItem } from './InventoryFurnitureItem';

export type TeacherFurnitureAllocationStatus = 'active' | 'returned' | 'lost';

@Entity('inventory_teacher_furniture_allocations')
export class InventoryTeacherFurnitureAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  furnitureItemId: string;

  @ManyToOne(() => InventoryFurnitureItem, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'furnitureItemId' })
  furnitureItem: InventoryFurnitureItem;

  /** The User.id of the teacher who received this allocation */
  @Column({ type: 'uuid', nullable: true })
  teacherUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'teacherUserId' })
  teacherUser: User;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status: TeacherFurnitureAllocationStatus;

  @Column({ type: 'uuid', nullable: true })
  authorizedByUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'authorizedByUserId' })
  authorizedBy: User;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
