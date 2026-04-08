import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';
import { InventoryTextbookCatalog } from './InventoryTextbookCatalog';

export type TeacherTextbookAllocationStatus = 'active' | 'returned' | 'partially_returned';

@Entity('inventory_teacher_textbook_allocations')
export class InventoryTeacherTextbookAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  catalogId: string;

  @ManyToOne(() => InventoryTextbookCatalog, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'catalogId' })
  catalog: InventoryTextbookCatalog;

  /** The User.id of the teacher who received this allocation */
  @Column({ type: 'uuid', nullable: true })
  teacherUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'teacherUserId' })
  teacherUser: User;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  /** Auto-generated sequential J-numbers for each copy, e.g. ["J0001","J0002"] */
  @Column({ type: 'simple-json', nullable: true })
  copyNumbers: string[] | null;

  /** Optional per–J-number condition (good | lost | torn); falls back to catalog condition */
  @Column({ type: 'simple-json', nullable: true })
  copyConditions: Record<string, string> | null;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status: TeacherTextbookAllocationStatus;

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
