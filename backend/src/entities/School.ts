import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { User } from './User';
import { Student } from './Student';
import { Teacher } from './Teacher';
import { Parent } from './Parent';
import { Class } from './Class';
import { Subject } from './Subject';
import { Exam } from './Exam';
import { Marks } from './Marks';
import { Invoice } from './Invoice';
import { Settings } from './Settings';
import { Message } from './Message';
import { Attendance } from './Attendance';
import { UniformItem } from './UniformItem';
import { InvoiceUniformItem } from './InvoiceUniformItem';
import { ReportCardRemarks } from './ReportCardRemarks';

@Entity('schools')
export class School {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 64, unique: true, name: 'schoolid' })
  schoolid: string;

  @Column({ type: 'text', nullable: true })
  logoUrl: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  phone: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  subscriptionEndDate: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => User, user => user.school)
  users: User[];

  @OneToMany(() => Student, student => student.school)
  students: Student[];

  @OneToMany(() => Teacher, teacher => teacher.school)
  teachers: Teacher[];

  @OneToMany(() => Parent, parent => parent.school)
  parents: Parent[];

  @OneToMany(() => Class, cls => cls.school)
  classes: Class[];

  @OneToMany(() => Subject, subject => subject.school)
  subjects: Subject[];

  @OneToMany(() => Exam, exam => exam.school)
  exams: Exam[];

  @OneToMany(() => Marks, marks => marks.school)
  marks: Marks[];

  @OneToMany(() => Invoice, invoice => invoice.school)
  invoices: Invoice[];

  @OneToMany(() => Settings, settings => settings.school)
  settingsRecords: Settings[];

  @OneToMany(() => Message, message => message.school)
  messages: Message[];

  @OneToMany(() => Attendance, attendance => attendance.school)
  attendanceRecords: Attendance[];

  @OneToMany(() => UniformItem, uniformItem => uniformItem.school)
  uniformItems: UniformItem[];

  @OneToMany(() => InvoiceUniformItem, invoiceUniformItem => invoiceUniformItem.school)
  invoiceUniformItems: InvoiceUniformItem[];

  @OneToMany(() => ReportCardRemarks, remarks => remarks.school)
  reportCardRemarks: ReportCardRemarks[];
}


