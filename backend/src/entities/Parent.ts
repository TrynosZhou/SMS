import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, OneToMany, ManyToOne } from 'typeorm';
import { User } from './User';
import { Student } from './Student';
import { School } from './School';

@Entity('parents')
export class Parent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  email: string;

  @OneToOne(() => User, user => user.parent)
  user: User;

  @Column({ nullable: true })
  userId: string;

  @OneToMany(() => Student, student => student.parent)
  students: Student[];

  @ManyToOne(() => School, school => school.parents, { nullable: false })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @Column({ type: 'uuid' })
  schoolId: string;
}

