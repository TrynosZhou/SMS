// src/app/services/exam.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ExamService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ---------------- Utility ----------------
  private normalizeExamType(examType: string, forReportCard: boolean = false): string {
    if (!examType) return examType;
    
    const trimmed = examType.trim();
    
    // For report card endpoint - expects "Mid-Term", "End-Term"
    if (forReportCard) {
      const reportCardMap: Record<string, string> = {
        'mid_term': 'Mid-Term',
        'mid-term': 'Mid-Term',
        'MID_TERM': 'Mid-Term',
        'Mid-Term': 'Mid-Term',
        'Mid Term': 'Mid-Term',
        
        'end_term': 'End-Term',
        'end-term': 'End-Term',
        'END_TERM': 'End-Term',
        'End-Term': 'End-Term',
        'End Term': 'End-Term'
      };
      return reportCardMap[trimmed] ?? trimmed;
    }
    
    // For other endpoints - expects "mid_term", "end_term"
    const standardMap: Record<string, string> = {
      'Mid-Term': 'mid_term',
      'mid-term': 'mid_term',
      'MID_TERM': 'mid_term',
      'mid_term': 'mid_term',
      'Mid Term': 'mid_term',
      
      'End-Term': 'end_term',
      'end-term': 'end_term',
      'END_TERM': 'end_term',
      'end_term': 'end_term',
      'End Term': 'end_term',
      
      'Assignment': 'assignment',
      'assignment': 'assignment',
      
      'Quiz': 'quiz',
      'quiz': 'quiz'
    };
    
    return standardMap[trimmed] ?? trimmed.toLowerCase().replace(/[\s-]/g, '_');
  }

  // ---------------- Exams ----------------
  getExams(classId?: string): Observable<any> {
    let params = new HttpParams();
    if (classId) params = params.set('classId', classId);

    return this.http.get(`${this.apiUrl}/exams`, { params }).pipe(
      map((res: any) => Array.isArray(res?.data) ? res.data : res),
      catchError(err => throwError(() => err))
    );
  }

  getExamById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/exams/${id}`).pipe(
      catchError(err => throwError(() => err))
    );
  }

  createExam(exam: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams`, exam).pipe(
      catchError(err => throwError(() => err))
    );
  }

  deleteAllExams(): Observable<any> {
    return this.http.delete(`${this.apiUrl}/exams`).pipe(
      catchError(err => throwError(() => err))
    );
  }

  // ---------------- Marks ----------------
  captureMarks(examId: string, marksData: any[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/marks`, { examId, marksData }).pipe(
      catchError(err => throwError(() => err))
    );
  }

  getMarks(examId?: string, studentId?: string, classId?: string): Observable<any> {
    let params = new HttpParams();
    if (examId) params = params.set('examId', examId);
    if (studentId) params = params.set('studentId', studentId);
    if (classId) params = params.set('classId', classId);

    return this.http.get(`${this.apiUrl}/exams/marks`, { params }).pipe(
      map((res: any) => Array.isArray(res?.marks) ? res.marks : res),
      catchError(err => throwError(() => err))
    );
  }

  // ---------------- Report Cards ----------------
  getReportCard(
    classId: string,
    examType: string,
    term: string,
    studentId?: string,
    subjectId?: string
  ): Observable<any> {
    let params = new HttpParams()
      .set('classId', classId)
      .set('examType', this.normalizeExamType(examType, true))  // ← CHANGED: Added true
      .set('term', term);

    if (studentId) params = params.set('studentId', studentId);
    if (subjectId) params = params.set('subjectId', subjectId);

    return this.http.get(`${this.apiUrl}/exams/report-card`, { params }).pipe(
      map((res: any) => ({
        ...res,
        reportCards: Array.isArray(res?.reportCards)
          ? res.reportCards.map((card: any) => ({
              ...card,
              subjects: Array.isArray(card?.subjects) ? card.subjects : []
            }))
          : []
      })),
      catchError(err => throwError(() => err))
    );
  }

  downloadAllReportCardsPDF(
    classId: string,
    examType: string,
    term: string,
    studentId?: string
  ): Observable<Blob> {
    let params = new HttpParams()
      .set('classId', classId)
      .set('examType', this.normalizeExamType(examType, true))  // ← CHANGED: Added true
      .set('term', term);

    if (studentId) params = params.set('studentId', studentId);

    return this.http.get(`${this.apiUrl}/exams/report-card/pdf`, { params, responseType: 'blob' });
  }

  saveReportCardRemarks(
    studentId: string,
    classId: string,
    examType: string,
    term: string,
    classTeacherRemarks: string,
    headmasterRemarks: string
  ): Observable<any> {
    const payload = {
      studentId,
      classId,
      examType: this.normalizeExamType(examType, true),
      term,
      classTeacherRemarks,
      headmasterRemarks
    };
    return this.http.post(`${this.apiUrl}/exams/report-card/remarks`, payload).pipe(
      catchError(err => throwError(() => err))
    );
  }

  // ---------------- Mark Sheets ----------------
  generateMarkSheet(classId: string, examType: string, term?: string): Observable<any> {
    let params = new HttpParams()
      .set('classId', classId)
      .set('examType', this.normalizeExamType(examType, false));

    if (term) params = params.set('term', term);

    return this.http.get(`${this.apiUrl}/exams/mark-sheet`, { params }).pipe(
      catchError(err => throwError(() => err))
    );
  }

  downloadMarkSheetPDF(classId: string, examType: string, term?: string): Observable<Blob> {
    let params = new HttpParams()
      .set('classId', classId)
      .set('examType', this.normalizeExamType(examType, false));

    if (term) params = params.set('term', term);

    return this.http.get(`${this.apiUrl}/exams/mark-sheet/pdf`, { params, responseType: 'blob' });
  }

  // ---------------- Rankings ----------------
  getClassRankingsByType(examType: string, classId: string): Observable<any> {
    let params = new HttpParams()
      .set('examType', this.normalizeExamType(examType, false))
      .set('classId', classId);
    return this.http.get(`${this.apiUrl}/exams/rankings/class-by-type`, { params }).pipe(
      catchError(err => throwError(() => err))
    );
  }

  getSubjectRankingsByType(examType: string, subjectId: string): Observable<any> {
    let params = new HttpParams()
      .set('examType', this.normalizeExamType(examType, false))
      .set('subjectId', subjectId);
    return this.http.get(`${this.apiUrl}/exams/rankings/subject-by-type`, { params }).pipe(
      catchError(err => throwError(() => err))
    );
  }

  getOverallPerformanceRankings(form: string, examType: string): Observable<any> {
    let params = new HttpParams()
      .set('form', form)
      .set('examType', this.normalizeExamType(examType, false));
    return this.http.get(`${this.apiUrl}/exams/rankings/overall-performance`, { params }).pipe(
      catchError(err => throwError(() => err))
    );
  }

  // ---------------- Publish/Unpublish ----------------
  publishExamByType(examType: string, term: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/publish-by-type`, {
      examType: this.normalizeExamType(examType, false),  // Keep as false for these
      term
    }).pipe(catchError(err => throwError(() => err)));
  }

  unpublishExamByType(examType: string, term: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/unpublish-by-type`, {
      examType: this.normalizeExamType(examType, false),  // Keep as false for these
      term
    }).pipe(catchError(err => throwError(() => err)));
  }
}
