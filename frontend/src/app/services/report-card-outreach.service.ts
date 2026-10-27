import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface UnviewedChild {
  studentId: string;
  studentName: string;
  studentNumber: string | null;
  classId: string;
  className: string;
  examType: string;
  examTypeLabel: string;
  term: string;
}

export interface UnviewedParent {
  parentId: string;
  parentName: string;
  phoneNumber: string | null;
  email: string | null;
  unviewedCount: number;
  children: UnviewedChild[];
}

export interface UnviewedParentsResponse {
  parents: UnviewedParent[];
  totalParents: number;
  totalUnviewed: number;
}

export interface NotifyParentResponse {
  ok: boolean;
  sent: boolean;
  skipped: boolean;
  dryRun: boolean;
  error: string | null;
  message?: string;
  apiError?: string | null;
  fallbackUrl: string | null;
  composedMessage?: string;
  recipient?: string;
  filename?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReportCardOutreachService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Fetch parents who have not yet viewed their linked children's report cards.
   * Optional term / examType filters narrow the result set.
   */
  getUnviewedParents(term?: string, examType?: string): Observable<UnviewedParentsResponse> {
    let params = new HttpParams();
    if (term && String(term).trim()) {
      params = params.set('term', String(term).trim());
    }
    if (examType && String(examType).trim()) {
      params = params.set('examType', String(examType).trim());
    }
    return this.http
      .get<UnviewedParentsResponse>(`${this.apiUrl}/report-card-views/unviewed-parents`, { params })
      .pipe(catchError((err) => { throw err; }));
  }

  /**
   * Fast admin report-card PDF preview — hits the optimised endpoint that
   * parallelises DB queries, skips fee checks, and returns the PDF buffer directly.
   */
  previewReportCardPdf(
    studentId: string,
    classId: string,
    examType: string,
    term: string
  ): Observable<Blob> {
    let params = new HttpParams()
      .set('studentId', studentId)
      .set('classId', classId)
      .set('examType', examType)
      .set('term', term);
    return this.http
      .get(`${this.apiUrl}/report-card-views/preview-pdf`, { params, responseType: 'blob' })
      .pipe(catchError((err) => { throw err; }));
  }

  /**
   * Send a WhatsApp nudge to a parent about a specific child's report card.
   */
  notifyParent(
    parentId: string,
    studentId: string,
    examType: string,
    term: string,
    customMessage?: string
  ): Observable<NotifyParentResponse> {
    const body: any = { parentId, studentId, examType, term };
    if (customMessage && String(customMessage).trim()) {
      body.customMessage = String(customMessage).trim();
    }
    return this.http
      .post<NotifyParentResponse>(`${this.apiUrl}/report-card-views/notify`, body)
      .pipe(catchError((err) => { throw err; }));
  }

  /**
   * Generate and send the student's report card PDF to the parent via WhatsApp.
   */
  sendReportCard(
    parentId: string,
    studentId: string,
    classId: string,
    examType: string,
    term: string
  ): Observable<NotifyParentResponse> {
    return this.http
      .post<NotifyParentResponse>(`${this.apiUrl}/report-card-views/send-report-card`, {
        parentId,
        studentId,
        classId,
        examType,
        term
      })
      .pipe(catchError((err) => { throw err; }));
  }
}
