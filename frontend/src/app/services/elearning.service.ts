import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ElearningService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Teacher: create a new e-learning task (assignment/test/notes).
   * Supports optional file upload via FormData.
   */
  createTask(payload: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}/elearning/tasks`, payload);
  }

  /**
   * Teacher: list tasks created by the current teacher.
   */
  getMyTasks(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/elearning/tasks/my`);
  }

  /**
   * Teacher: get student responses for a given task.
   */
  getTaskResponses(taskId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/elearning/tasks/${taskId}/responses`);
  }

  /**
   * Student: list tasks assigned to the current student.
   */
  getStudentTasks(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/elearning/tasks/student`);
  }

  /**
   * Student: submit a response (file or text) for a task.
   */
  submitResponse(taskId: string, payload: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}/elearning/tasks/${taskId}/responses`, payload);
  }
}

