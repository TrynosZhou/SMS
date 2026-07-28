import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AdmissionApplication } from './AdmissionApplication';

export enum AdmissionDocumentType {
  BIRTH_CERTIFICATE = 'birth_certificate',
  REPORT_CARD = 'report_card',
  ID_PHOTO = 'id_photo',
  MEDICAL_FORM = 'medical_form',
  OTHER = 'other',
}

@Entity('admission_documents')
@Index(['applicationId'])
export class AdmissionDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => AdmissionApplication, (app) => app.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'applicationId' })
  application: AdmissionApplication;

  @Column({
    type: 'enum',
    enum: AdmissionDocumentType,
  })
  documentType: AdmissionDocumentType;

  @Column()
  originalFilename: string;

  @Column()
  storedPath: string;

  @Column({ nullable: true })
  mimeType: string | null;

  @Column({ type: 'int', default: 0 })
  fileSize: number;

  @CreateDateColumn()
  uploadedAt: Date;
}
