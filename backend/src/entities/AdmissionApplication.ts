import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './User';
import { Class } from './Class';
import { AdmissionDocument } from './AdmissionDocument';
import { Student } from './Student';

export enum AdmissionApplicationType {
  NEW_ADMISSION = 'new_admission',
  TRANSFER = 'transfer',
}

export enum AdmissionApplicationStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

export enum AdmissionSubmittedBy {
  APPLICANT = 'applicant',
  PARENT = 'parent',
}

@Entity('admission_applications')
@Index(['status'])
@Index(['applicantUserId'])
@Index(['parentUserId'])
export class AdmissionApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  applicationNumber: string;

  @Column({ type: 'uuid', nullable: true })
  applicantUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'applicantUserId' })
  applicantUser: User | null;

  @Column({ type: 'uuid', nullable: true })
  parentUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parentUserId' })
  parentUser: User | null;

  @Column({
    type: 'enum',
    enum: AdmissionSubmittedBy,
    default: AdmissionSubmittedBy.APPLICANT,
  })
  submittedBy: AdmissionSubmittedBy;

  @Column({
    type: 'enum',
    enum: AdmissionApplicationType,
    default: AdmissionApplicationType.NEW_ADMISSION,
  })
  applicationType: AdmissionApplicationType;

  @Column({
    type: 'enum',
    enum: AdmissionApplicationStatus,
    default: AdmissionApplicationStatus.PENDING,
  })
  status: AdmissionApplicationStatus;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ nullable: true })
  gender: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ nullable: true })
  phone: string | null;

  @Column({ nullable: true })
  email: string | null;

  @Column({ nullable: true })
  previousSchool: string | null;

  @Column({ type: 'uuid', nullable: true })
  classApplyingForId: string | null;

  @ManyToOne(() => Class, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'classApplyingForId' })
  classApplyingFor: Class | null;

  @Column({ nullable: true })
  gradeApplyingFor: string | null;

  @Column({ nullable: true })
  guardianName: string | null;

  @Column({ nullable: true })
  guardianRelationship: string | null;

  @Column({ nullable: true })
  guardianPhone: string | null;

  @Column({ nullable: true })
  guardianEmail: string | null;

  @Column({ type: 'text', nullable: true })
  guardianAddress: string | null;

  @Column({ type: 'text', nullable: true })
  academicNotes: string | null;

  @Column({ type: 'text', nullable: true })
  reviewNotes: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedByUserId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  enrolledStudentId: string | null;

  @ManyToOne(() => Student, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'enrolledStudentId' })
  enrolledStudent: Student | null;

  @Column({ type: 'timestamp', nullable: true })
  enrolledAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => AdmissionDocument, (doc) => doc.application, { cascade: true })
  documents: AdmissionDocument[];
}
