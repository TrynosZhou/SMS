import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Student } from './Student';
import { User } from './User';
import { InventoryTextbookIssuance } from './InventoryTextbookIssuance';
import { InventoryFurnitureIssuance } from './InventoryFurnitureIssuance';

export type InventoryFineType = 'loan_overdue' | 'furniture_damage' | 'lost_book' | 'lost_furniture';
export type InventoryFineStatus = 'pending' | 'paid' | 'waived' | 'invoiced';

@Entity('inventory_fines')
export class InventoryFine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column({ type: 'varchar', length: 24 })
  fineType: InventoryFineType;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amount: number;

  @Column({ type: 'int', nullable: true })
  daysOverdue: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  dailyRateSnapshot: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: InventoryFineStatus;

  @Column({ type: 'uuid', nullable: true })
  textbookIssuanceId: string | null;

  @ManyToOne(() => InventoryTextbookIssuance, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'textbookIssuanceId' })
  textbookIssuance: InventoryTextbookIssuance | null;

  @Column({ type: 'uuid', nullable: true })
  furnitureIssuanceId: string | null;

  @ManyToOne(() => InventoryFurnitureIssuance, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'furnitureIssuanceId' })
  furnitureIssuance: InventoryFurnitureIssuance | null;

  @Column({ type: 'uuid', nullable: true })
  invoiceId: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'uuid' })
  assessedByUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'assessedByUserId' })
  assessedBy: User;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
