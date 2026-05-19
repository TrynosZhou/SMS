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

  /** Teacher: delete a task I created. */
  deleteTask(taskId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/elearning/tasks/${taskId}`);
  }

  /**
   * Teacher: get student responses for a given task.
   */
  getTaskResponses(taskId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/elearning/tasks/${taskId}/responses`);
  }

  /** Teacher: get a single response (with task & student). */
  getResponseById(responseId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/elearning/responses/${responseId}`);
  }

  /** Teacher: mark a student response (score + feedback + optional file). */
  markResponse(responseId: string, payload: FormData): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/elearning/responses/${responseId}/mark`, payload);
  }

  /**
   * Student: list tasks assigned to the current student.
   */
  getStudentTasks(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/elearning/tasks/student`);
  }

  /** Student: get a single assigned task by id. */
  getStudentTaskById(taskId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/elearning/tasks/student/${taskId}`);
  }

  /** Admin: all teacher tasks for a class. */
  getAdminClassTasks(classId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/elearning/admin/class/${classId}/tasks`);
  }

  /**
   * Student: submit a response (file or text) for a task.
   */
  submitResponse(taskId: string, payload: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}/elearning/tasks/${taskId}/responses`, payload);
  }

  /** Student: list my submitted responses (optionally only those marked). */
  getStudentResponses(markedOnly = false): Observable<any[]> {
    const params = markedOnly ? new HttpParams().set('marked', 'true') : undefined;
    return this.http.get<any[]>(`${this.apiUrl}/elearning/responses/student`, { params });
  }
}

