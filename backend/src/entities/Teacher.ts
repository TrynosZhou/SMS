import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, ManyToMany, JoinTable, Index } from 'typeorm';
import { User } from './User';
import { Subject } from './Subject';
import { Class } from './Class';

@Entity('teachers')
@Index(['employeeNumber'], { unique: true })
export class Teacher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column()
  employeeNumber: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date;

  @Column({ default: true })
  isActive: boolean;

  @OneToOne(() => User, user => user.teacher)
  user: User;

  @Column({ nullable: true })
  userId: string;

  @ManyToMany(() => Subject, subject => subject.teachers)
  @JoinTable()
  subjects: Subject[];

  @ManyToMany(() => Class, classEntity => classEntity.teachers)
  @JoinTable()
  classes: Class[];
}

