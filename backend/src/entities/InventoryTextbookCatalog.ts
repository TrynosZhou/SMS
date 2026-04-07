import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Subject } from './Subject';
import { InventoryTextbookIssuance } from './InventoryTextbookIssuance';

@Entity('inventory_textbook_catalog')
export class InventoryTextbookCatalog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'varchar', nullable: true })
  isbn: string | null;

  @Column({ type: 'uuid', nullable: true })
  subjectId: string | null;

  @ManyToOne(() => Subject, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'subjectId' })
  subject: Subject | null;

  @Column({ type: 'varchar', nullable: true })
  gradeLevel: string | null;

  /** Default / shelf condition note */
  @Column({ type: 'varchar', default: 'good' })
  condition: string;

  @Column({ type: 'int', default: 0 })
  quantityTotal: number;

  @Column({ type: 'int', default: 0 })
  quantityAvailable: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @OneToMany(() => InventoryTextbookIssuance, i => i.catalog)
  issuances: InventoryTextbookIssuance[];
}
