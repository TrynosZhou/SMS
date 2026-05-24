import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { User } from './User';
import { RbacRole } from './RbacRole';

@Entity('user_rbac_roles')
@Unique(['userId', 'roleId'])
export class UserRbacRole {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  roleId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @ManyToOne(() => RbacRole, (role) => role.userAssignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roleId' })
  role!: RbacRole;

  @CreateDateColumn()
  createdAt!: Date;
}
