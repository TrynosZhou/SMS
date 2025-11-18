import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToOne, OneToMany, Index } from 'typeorm';
import { User } from './User';
import { Class } from './Class';
import { Parent } from './Parent';
import { Marks } from './Marks';
import { Invoice } from './Invoice';

@Entity('students')
@Index(['studentNumber'], { unique: true })
export class Student {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column()
  studentNumber: string;

  @Column({ type: 'date' })
  dateOfBirth: Date;

  @Column()
  gender: string;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  contactNumber: string;

  @Column({ type: 'varchar', length: 20, default: 'Day Scholar' })
  studentType: string; // 'Boarder' or 'Day Scholar'

  @Column({ type: 'boolean', default: false })
  usesTransport: boolean; // Day scholar using school transport

  @Column({ type: 'boolean', default: false })
  usesDiningHall: boolean; // Day scholar using dining hall (DH) meals

  @Column({ type: 'boolean', default: false })
  isStaffChild: boolean; // Staff children don't pay tuition, pay 50% DH fees, don't pay transport

  @Column({ type: 'varchar', nullable: true })
  photo: string | null; // Path to student's passport photo

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  enrollmentDate: Date;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => Class, classEntity => classEntity.students)
  @JoinColumn({ name: 'classId' })
  class: Class;

  @Column({ nullable: true })
  classId: string | null;

  @OneToOne(() => User, user => user.student)
  user: User;

  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => Parent, parent => parent.students, { nullable: true })
  @JoinColumn({ name: 'parentId' })
  parent: Parent;

  @Column({ nullable: true })
  parentId: string | null;

  @OneToMany(() => Marks, marks => marks.student)
  marks: Marks[];

  @OneToMany(() => Invoice, invoice => invoice.student)
  invoices: Invoice[];
}

