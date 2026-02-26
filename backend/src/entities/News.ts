import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, BeforeInsert, BeforeUpdate } from 'typeorm';
import { User, UserRole } from './User';

export enum NewsCategory {
  GENERAL = 'general',
  ACADEMIC = 'academic',
  EVENTS = 'events',
  SPORTS = 'sports',
  ANNOUNCEMENT = 'announcement',
  HOLIDAY = 'holiday',
  EXAMINATION = 'examination',
  ADMISSION = 'admission',
  STAFF = 'staff',
  FACILITY = 'facility'
}

export enum NewsStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived'
}

@Entity('news')
@Index(['status', 'publishedAt'])
@Index(['isPinned', 'publishedAt'])
@Index(['expiresAt'])
@Index(['category'])
@Index(['authorId'])
export class News {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  summary: string | null;

  @Column({
    type: 'enum',
    enum: NewsCategory,
    default: NewsCategory.GENERAL
  })
  category: NewsCategory;

  @Column({
    type: 'enum',
    enum: NewsStatus,
    default: NewsStatus.DRAFT
  })
  status: NewsStatus;

  @Column({ default: false })
  isPinned: boolean;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl: string | null;

  @Column({ type: 'json', nullable: true })
  targetRoles: UserRole[] | null;

  @Column({ type: 'json', nullable: true })
  attachments: string[] | null;

  @Column({ type: 'int', default: 0 })
  viewCount: number;

  @Column({ type: 'boolean', default: true })
  allowComments: boolean;

  @Column({ type: 'text', nullable: true })
  tags: string | null;

  @Column({ type: 'uuid' })
  authorId: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @BeforeInsert()
  @BeforeUpdate()
  updateTimestamps() {
    if (this.status === NewsStatus.PUBLISHED && !this.publishedAt) {
      this.publishedAt = new Date();
    }
  }

  @BeforeInsert()
  @BeforeUpdate()
  validateExpiry() {
    if (this.expiresAt && this.expiresAt <= new Date()) {
      this.status = NewsStatus.ARCHIVED;
    }
  }

  // Helper method to check if news is currently active
  isActive(): boolean {
    const now = new Date();
    return (
      this.status === NewsStatus.PUBLISHED &&
      this.publishedAt !== null &&
      this.publishedAt <= now &&
      (!this.expiresAt || this.expiresAt > now)
    );
  }

  // Helper method to check if news is visible to a specific role
  isVisibleToRole(role: UserRole): boolean {
    if (!this.targetRoles || this.targetRoles.length === 0) {
      return true; // Visible to all if no target roles specified
    }
    return this.targetRoles.includes(role);
  }
}
