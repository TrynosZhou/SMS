import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { UserRbacRole } from './UserRbacRole';

@Entity('rbac_roles')
export class RbacRole {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ unique: true })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** System roles cannot be deleted (mapped from built-in UserRole) */
  @Column({ default: false })
  isSystem!: boolean;

  /** Optional link to legacy User.role enum value for bootstrap sync */
  @Column({ type: 'varchar', length: 64, nullable: true })
  legacyRoleKey!: string | null;

  /** Permission map: { "students.view": true, "finance.export": false, ... } */
  @Column({ type: 'jsonb', default: {} })
  permissions!: Record<string, boolean>;

  @OneToMany(() => UserRbacRole, (ur) => ur.role)
  userAssignments!: UserRbacRole[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
