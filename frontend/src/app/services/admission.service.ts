import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type AdmissionApplicationType = 'new_admission' | 'transfer';
export type AdmissionApplicationStatus = 'pending' | 'under_review' | 'accepted' | 'rejected';

export interface AdmissionDocument {
  id: string;
  documentType: string;
  originalFilename: string;
  storedPath: string;
  mimeType?: string;
  fileSize: number;
  uploadedAt: string;
}

export interface AdmissionApplication {
  id: string;
  applicationNumber: string;
  applicationType: AdmissionApplicationType;
  status: AdmissionApplicationStatus;
  submittedBy: 'applicant' | 'parent';
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  phone?: string;
  email?: string;
  previousSchool?: string;
  classApplyingForId?: string;
  gradeApplyingFor?: string;
  classApplyingFor?: { id: string; name: string };
  guardianName?: string;
  guardianRelationship?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  guardianAddress?: string;
  academicNotes?: string;
  reviewNotes?: string;
  submittedAt?: string;
  enrolledStudentId?: string | null;
  enrolledAt?: string | null;
  enrolledStudent?: { id: string; studentNumber: string; firstName?: string; lastName?: string };
  createdAt: string;
  updatedAt: string;
  documents?: AdmissionDocument[];
}

export interface AdmissionClassOption {
  id: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class AdmissionService {
  private base = `${environment.apiUrl}/admissions`;

  constructor(private http: HttpClient) {}

  getMyApplications(): Observable<AdmissionApplication[]> {
    return this.http.get<AdmissionApplication[]>(`${this.base}/mine`);
  }

  getAdminApplications(search?: string, status?: string): Observable<AdmissionApplication[]> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    if (status) params = params.set('status', status);
    return this.http.get<AdmissionApplication[]>(`${this.base}/admin/list`, { params });
  }

  getApplication(id: string): Observable<AdmissionApplication> {
    return this.http.get<AdmissionApplication>(`${this.base}/${id}`);
  }

  getClasses(): Observable<AdmissionClassOption[]> {
    return this.http.get<AdmissionClassOption[]>(`${this.base}/classes`);
  }

  submitApplication(formData: FormData): Observable<any> {
    return this.http.post(`${this.base}`, formData);
  }

  updateApplication(id: string, formData: FormData): Observable<any> {
    return this.http.put(`${this.base}/${id}`, formData);
  }

  updateStatus(id: string, status: AdmissionApplicationStatus, reviewNotes?: string): Observable<any> {
    return this.http.patch(`${this.base}/${id}/status`, { status, reviewNotes });
  }

  enrollApplication(id: string): Observable<any> {
    return this.http.post(`${this.base}/${id}/enroll`, {});
  }

  sendWhatsAppToApplicant(id: string, message: string): Observable<any> {
    return this.http.post(`${this.base}/${id}/whatsapp`, { message });
  }

  downloadDocumentUrl(applicationId: string, docId: string): string {
    return `${this.base}/${applicationId}/documents/${docId}/download`;
  }

  statusLabel(status: AdmissionApplicationStatus): string {
    const map: Record<AdmissionApplicationStatus, string> = {
      pending: 'Pending',
      under_review: 'Under review',
      accepted: 'Accepted',
      rejected: 'Rejected',
    };
    return map[status] || status;
  }
}
