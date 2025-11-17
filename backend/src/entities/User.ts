import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, ManyToOne, Index } from 'typeorm';
import { Student } from './Student';
import { Teacher } from './Teacher';
import { Parent } from './Parent';
import { School } from './School';

export enum UserRole {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  ACCOUNTANT = 'accountant',
  TEACHER = 'teacher',
  PARENT = 'parent',
  STUDENT = 'student'
}

@Entity('users')
@Index(['email', 'schoolId'], { unique: true })
@Index(['username', 'schoolId'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  username: string;

  @Column()
  password: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.STUDENT
  })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  mustChangePassword: boolean;

  @Column({ default: false })
  isTemporaryAccount: boolean;

  @Column({ default: false })
  isDemo: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ManyToOne(() => School, school => school.users, { nullable: false })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @Column({ type: 'uuid' })
  schoolId: string;

  @OneToOne(() => Student, student => student.user, { nullable: true })
  @JoinColumn()
  student: Student;

  @OneToOne(() => Teacher, teacher => teacher.user, { nullable: true })
  @JoinColumn()
  teacher: Teacher;

  @OneToOne(() => Parent, parent => parent.user, { nullable: true })
  @JoinColumn()
  parent: Parent;
}

