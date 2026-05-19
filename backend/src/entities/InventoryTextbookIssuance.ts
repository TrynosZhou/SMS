import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Student } from './Student';
import { User } from './User';
import { InventoryTextbookCatalog } from './InventoryTextbookCatalog';
export type TextbookIssuanceType = 'permanent' | 'loan';
export type TextbookIssuanceStatus = 'active' | 'returned' | 'lost' | 'overdue';

@Entity('inventory_textbook_issuances')
export class InventoryTextbookIssuance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  catalogId: string;

  @ManyToOne(() => InventoryTextbookCatalog, c => c.issuances, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'catalogId' })
  catalog: InventoryTextbookCatalog;

  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column({ type: 'varchar', length: 16 })
  issuanceType: TextbookIssuanceType;

  @Column({ type: 'timestamp', nullable: true })
  loanDueAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  returnedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lostReportedAt: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: TextbookIssuanceStatus;

  @Column({ type: 'uuid' })
  authorizedByUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'authorizedByUserId' })
  authorizedBy: User;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** Unique copy number (e.g. J0001) assigned when issued via teacher allocation */
  @Column({ type: 'varchar', length: 16, nullable: true })
  copyNumber: string | null;

  /** Links back to the teacher allocation this copy came from, if issued via teacher */
  @Column({ type: 'uuid', nullable: true })
  teacherAllocationId: string | null;

  /** Teacher-recorded physical state: good | lost | torn (overrides display when set) */
  @Column({ type: 'varchar', length: 16, nullable: true })
  physicalCondition: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
