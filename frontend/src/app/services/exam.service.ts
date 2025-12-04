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

  constructor(private http: HttpClient) { }

  getExams(classId?: string): Observable<any> {
    const options: any = {};
    if (classId) {
      options.params = { classId };
    }
    return this.http.get(`${this.apiUrl}/exams`, options).pipe(
      map((response: any) => {
        // Ensure response is an array
        if (Array.isArray(response)) {
          return response;
        }
        if (response && Array.isArray(response.data)) {
          return response.data;
        }
        if (response && Array.isArray(response.exams)) {
          return response.exams;
        }
        // If response is an error object or non-array, return empty array
        if (response && typeof response === 'object' && !Array.isArray(response)) {
          console.warn('getExams: Received non-array response, normalizing to empty array:', response);
          return [];
        }
        return [];
      }),
      catchError((error: any) => {
        console.error('Error loading exams:', error);
        return throwError(() => error);
      })
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
        // Ensure response is an array
        if (Array.isArray(response)) {
          return response;
        }
        if (response && Array.isArray(response.data)) {
          return response.data;
        }
        if (response && Array.isArray(response.marks)) {
          return response.marks;
        }
        // If response is an error object or non-array, return empty array
        if (response && typeof response === 'object' && !Array.isArray(response)) {
          console.warn('getMarks: Received non-array response, normalizing to empty array:', response);
          return [];
        }
        return [];
      }),
      catchError((error: any) => {
        console.error('Error loading marks:', error);
        return throwError(() => error);
      })
    );
  }

  getClassRankings(examId: string, classId?: string): Observable<any> {
    const params: any = { examId };
    if (classId) params.classId = classId;
    return this.http.get(`${this.apiUrl}/exams/rankings/class`, { params });
  }

  getClassRankingsByType(examType: string, classId: string): Observable<any> {
    const params: any = { examType, classId };
    return this.http.get(`${this.apiUrl}/exams/rankings/class-by-type`, { params });
  }

  getSubjectRankings(examId: string, subjectId: string, classId?: string): Observable<any> {
    const params: any = { examId, subjectId };
    if (classId) params.classId = classId;
    return this.http.get(`${this.apiUrl}/exams/rankings/subject`, { params });
  }

  getSubjectRankingsByType(examType: string, subjectId: string): Observable<any> {
    const params: any = { examType, subjectId };
    return this.http.get(`${this.apiUrl}/exams/rankings/subject-by-type`, { params });
  }

  getFormRankings(examId: string, form: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/exams/rankings/form`, { params: { examId, form } });
  }

  getOverallPerformanceRankings(form: string, examType: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/exams/rankings/overall-performance`, { params: { form, examType } });
  }

  getReportCard(classId: string, examType: string, term: string, studentId?: string, subjectId?: string): Observable<any> {
    const url = `${this.apiUrl}/exams/report-card`;
    const params: any = {};
    
    // Only add defined and non-empty parameters
    if (classId) params.classId = String(classId).trim();
    if (examType) params.examType = String(examType).trim();
    if (term) params.term = String(term).trim();
    if (studentId && studentId.trim() !== '') {
      params.studentId = String(studentId).trim();
    }
    if (subjectId && subjectId.trim() !== '') {
      params.subjectId = String(subjectId).trim();
    }
    
    console.log('Requesting report card:', url, params);
    return this.http.get(url, { params }).pipe(
      map((response: any) => {
        const normalized = {
          ...response,
          reportCards: Array.isArray(response?.reportCards) ? response.reportCards : []
        };

        normalized.reportCards = normalized.reportCards.map((card: any) => ({
          ...card,
          subjects: Array.isArray(card?.subjects) ? card.subjects : []
        }));

        return normalized;
      }),
      catchError((error: any) => {
        console.error('Report card request failed:', error);
        return throwError(() => error);
      })
    );
  }

  downloadReportCardPDF(studentId: string, examId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/exams/report-card/pdf`, {
      params: { studentId, examId },
      responseType: 'blob'
    });
  }

  downloadAllReportCardsPDF(classId: string, examType: string, term: string, studentId: string): Observable<Blob> {
    // For individual student PDF download from the generated report cards
    return this.http.get(`${this.apiUrl}/exams/report-card/pdf`, {
      params: { classId, examType, term, studentId },
      responseType: 'blob'
    });
  }

  saveReportCardRemarks(studentId: string, classId: string, examType: string, classTeacherRemarks: string, headmasterRemarks: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/report-card/remarks`, {
      studentId,
      classId,
      examType,
      classTeacherRemarks,
      headmasterRemarks
    });
  }

  deleteExam(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/exams/${id}`);
  }

  deleteAllExams(): Observable<any> {
    return this.http.delete(`${this.apiUrl}/exams/all`);
  }

  generateMarkSheet(classId: string, examType: string, term?: string): Observable<any> {
    const params: any = { classId, examType };
    if (term) params.term = term;
    return this.http.get(`${this.apiUrl}/exams/mark-sheet`, { params });
  }

  downloadMarkSheetPDF(classId: string, examType: string, term?: string): Observable<Blob> {
    const params: any = { classId, examType };
    if (term) params.term = term;
    return this.http.get(`${this.apiUrl}/exams/mark-sheet/pdf`, {
      params,
      responseType: 'blob'
    });
  }

  publishExam(examId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/publish`, { examId });
  }

  publishExamByType(examType: string, term: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/publish-by-type`, { examType, term });
  }

  unpublishExamByType(examType: string, term: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/unpublish-by-type`, { examType, term });
  }
}

