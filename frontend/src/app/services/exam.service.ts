import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
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
    return this.http.get(`${this.apiUrl}/exams`, options);
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
    return this.http.get(`${this.apiUrl}/exams/marks`, { params });
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

  getReportCard(classId: string, examType: string, term: string, studentId?: string): Observable<any> {
    const url = `${this.apiUrl}/exams/report-card`;
    const params: any = { classId, examType, term };
    if (studentId) {
      params.studentId = studentId;
    }
    console.log('Requesting report card:', url, params);
    return this.http.get(url, { params });
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

  generateMarkSheet(classId: string, examType: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/exams/mark-sheet`, {
      params: { classId, examType }
    });
  }

  downloadMarkSheetPDF(classId: string, examType: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/exams/mark-sheet/pdf`, {
      params: { classId, examType },
      responseType: 'blob'
    });
  }

  publishExam(examId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/publish`, { examId });
  }

  publishExamByType(examType: string, term: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/exams/publish-by-type`, { examType, term });
  }
}

