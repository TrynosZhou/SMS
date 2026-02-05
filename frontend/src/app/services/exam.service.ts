import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ExamService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ✅ NORMALIZE examType BEFORE sending to backend
  private normalizeExamType(examType: string): string {
    if (!examType) return examType;

    const map: Record<string, string> = {
      'mid_term': 'Mid-Term',
      'MID_TERM': 'Mid-Term',
      'Mid-Term': 'Mid-Term',

      'end_term': 'End-Term',
      'END_TERM': 'End-Term',
      'End-Term': 'End-Term'
    };

    return map[examType.trim()] ?? examType.trim();
  }

  getExams(classId?: string): Observable<any> {
    const options: any = {};
    if (classId) options.params = { classId };

    return this.http.get(`${this.apiUrl}/exams`, options).pipe(
      map((response: any) => {
        if (Array.isArray(response)) return response;
        if (Array.isArray(response?.data)) return response.data;
        if (Array.isArray(response?.exams)) return response.exams;
        return [];
      }),
      catchError(error => throwError(() => error))
    );
  }

  getExamById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/exams/${id}`);
  }

  createExam(exam: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams`, exam);
  }

  captureMarks(examId: string, marksData: any[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/marks`, { examId, marksData });
  }

  getMarks(examId?: string, studentId?: string, classId?: string): Observable<any> {
    const params: any = {};
    if (examId) params.examId = examId;
    if (studentId) params.studentId = studentId;
    if (classId) params.classId = classId;

    return this.http.get(`${this.apiUrl}/exams/marks`, { params }).pipe(
      map((response: any) => {
        if (Array.isArray(response)) return response;
        if (Array.isArray(response?.data)) return response.data;
        if (Array.isArray(response?.marks)) return response.marks;
        return [];
      }),
      catchError(error => throwError(() => error))
    );
  }
  saveReportCardRemarks(payload: {
    studentId: string;
    term: string;
    examType: string;
    remarks: string;
  }) {
    return this.http.post(
      `${this.apiUrl}/exams/report-card/remarks`,
      payload
    );
  }
  
  getReportCard(
    classId: string,
    examType: string,
    term: string,
    studentId?: string,
    subjectId?: string
  ): Observable<any> {
    const params: any = {};

    if (classId) params.classId = classId.trim();
    if (examType) params.examType = this.normalizeExamType(examType);
    if (term) params.term = term.trim();
    if (studentId) params.studentId = studentId.trim();
    if (subjectId) params.subjectId = subjectId.trim();

    console.log('Requesting report card:', params);

    return this.http.get(`${this.apiUrl}/exams/report-card`, { params }).pipe(
      map((response: any) => ({
        ...response,
        reportCards: Array.isArray(response?.reportCards)
          ? response.reportCards.map((card: any) => ({
              ...card,
              subjects: Array.isArray(card?.subjects) ? card.subjects : []
            }))
          : []
      })),
      catchError(error => throwError(() => error))
    );
  }

  downloadAllReportCardsPDF(
    classId: string,
    examType: string,
    term: string,
    studentId: string
  ): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/exams/report-card/pdf`, {
      params: {
        classId,
        examType: this.normalizeExamType(examType),
        term,
        studentId
      },
      responseType: 'blob'
    });
  }

  generateMarkSheet(classId: string, examType: string, term?: string): Observable<any> {
    const params: any = {
      classId,
      examType: this.normalizeExamType(examType)
    };
    if (term) params.term = term;

    return this.http.get(`${this.apiUrl}/exams/mark-sheet`, { params });
  }

  downloadMarkSheetPDF(classId: string, examType: string, term?: string): Observable<Blob> {
    const params: any = {
      classId,
      examType: this.normalizeExamType(examType)
    };
    if (term) params.term = term;

    return this.http.get(`${this.apiUrl}/exams/mark-sheet/pdf`, {
      params,
      responseType: 'blob'
    });
  }

  publishExamByType(examType: string, term: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/publish-by-type`, {
      examType: this.normalizeExamType(examType),
      term
    });
  }

  unpublishExamByType(examType: string, term: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/unpublish-by-type`, {
      examType: this.normalizeExamType(examType),
      term
    });
  }
}
