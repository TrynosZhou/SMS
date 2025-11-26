import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Student } from './Student';
import { Class } from './Class';
import { User } from './User';

export enum StudentTransferStatus {
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export enum TransferType {
  INTERNAL = 'internal',
  EXTERNAL = 'external'
}

@Entity('student_transfers')
export class StudentTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Student, student => student.transfers, { eager: true })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne(() => Class, { nullable: true, eager: true })
  @JoinColumn({ name: 'fromClassId' })
  fromClass?: Class | null;

  @Column({ type: 'uuid', nullable: true })
  fromClassId: string | null;

  @ManyToOne(() => Class, { nullable: true, eager: true })
  @JoinColumn({ name: 'toClassId' })
  toClass?: Class | null;

  @Column({ type: 'uuid', nullable: true })
  toClassId: string | null;

  @Column({
    type: 'varchar',
    default: TransferType.INTERNAL
  })
  transferType: TransferType;

  // External transfer fields (only used when transferType is EXTERNAL)
  @Column({ type: 'varchar', nullable: true })
  externalSchoolName: string | null;

  @Column({ type: 'text', nullable: true })
  externalSchoolAddress: string | null;

  @Column({ type: 'varchar', nullable: true })
  externalSchoolPhone: string | null;

  @Column({ type: 'varchar', nullable: true })
  externalSchoolEmail: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'performedByUserId' })
  performedBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  performedByUserId: string | null;

  @Column({
    type: 'varchar',
    default: StudentTransferStatus.COMPLETED
  })
  status: StudentTransferStatus;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

