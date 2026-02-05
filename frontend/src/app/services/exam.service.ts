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
 // src/app/services/exam.service.ts

private normalizeExamType(examType: string): string {
  if (!examType) return examType;
  
  // Convert display format to API format
  const map: Record<string, string> = {
    'Mid-Term': 'mid_term',
    'mid-term': 'mid_term',
    'MID_TERM': 'mid_term',
    'mid_term': 'mid_term',
    
    'End-Term': 'end_term',
    'end-term': 'end_term',
    'END_TERM': 'end_term',
    'end_term': 'end_term',
    
    'Assignment': 'assignment',
    'assignment': 'assignment',
    
    'Quiz': 'quiz',
    'quiz': 'quiz'
  };
  
  return map[examType.trim()] ?? examType.trim().toLowerCase().replace(/-/g, '_');
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
      .set('examType', this.normalizeExamType(examType))
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
      .set('examType', this.normalizeExamType(examType))
      .set('term', term);

    if (studentId) params = params.set('studentId', studentId);

    return this.http.get(`${this.apiUrl}/exams/report-card/pdf`, { params, responseType: 'blob' });
  }

  saveReportCardRemarks(
    selectedClass: string,
    selectedExamType: string,
    classTeacherRemarks: string,
    headmasterRemarks: string,
    studentId?: string
  ): Observable<any> {
    const payload = { selectedClass, selectedExamType, classTeacherRemarks, headmasterRemarks, studentId };
    return this.http.post(`${this.apiUrl}/exams/report-card/remarks`, payload).pipe(
      catchError(err => throwError(() => err))
    );
  }

  // ---------------- Mark Sheets ----------------
  generateMarkSheet(classId: string, examType: string, term?: string): Observable<any> {
    let params = new HttpParams()
      .set('classId', classId)
      .set('examType', this.normalizeExamType(examType));

    if (term) params = params.set('term', term);

    return this.http.get(`${this.apiUrl}/exams/mark-sheet`, { params }).pipe(
      catchError(err => throwError(() => err))
    );
  }

  downloadMarkSheetPDF(classId: string, examType: string, term?: string): Observable<Blob> {
    let params = new HttpParams()
      .set('classId', classId)
      .set('examType', this.normalizeExamType(examType));

    if (term) params = params.set('term', term);

    return this.http.get(`${this.apiUrl}/exams/mark-sheet/pdf`, { params, responseType: 'blob' });
  }

  // ---------------- Rankings ----------------
  getClassRankingsByType(examType: string, className: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/rankings/class/${className}/${this.normalizeExamType(examType)}`).pipe(
      catchError(err => throwError(() => err))
    );
  }

  getSubjectRankingsByType(examType: string, subject: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/rankings/subject/${subject}/${this.normalizeExamType(examType)}`).pipe(
      catchError(err => throwError(() => err))
    );
  }

  getOverallPerformanceRankings(form: string, examType: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/rankings/overall/${form}/${this.normalizeExamType(examType)}`).pipe(
      catchError(err => throwError(() => err))
    );
  }

  // ---------------- Publish/Unpublish ----------------
  publishExamByType(examType: string, term: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/publish-by-type`, {
      examType: this.normalizeExamType(examType),
      term
    }).pipe(catchError(err => throwError(() => err)));
  }

  unpublishExamByType(examType: string, term: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/unpublish-by-type`, {
      examType: this.normalizeExamType(examType),
      term
    }).pipe(catchError(err => throwError(() => err)));
  }
}
