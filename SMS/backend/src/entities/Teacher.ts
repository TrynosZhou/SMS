import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, ManyToMany, JoinTable, Index } from 'typeorm';
import { User } from './User';
import { Subject } from './Subject';
import { Class } from './Class';

@Entity('teachers')
@Index(['teacherId'], { unique: true })
export class Teacher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column()
  teacherId: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date;

  @Column({ nullable: true })
  sex: string | null;

  /** Passport-size photo (base64 data URL) for ID card; optional on register, can be set when editing */
  @Column({ type: 'text', nullable: true })
  photo: string | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @OneToOne(() => User, user => user.teacher)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToMany(() => Subject, subject => subject.teachers)
  @JoinTable()
  subjects: Subject[];

  @ManyToMany(() => Class, classEntity => classEntity.teachers)
  @JoinTable()
  classes: Class[];
}

