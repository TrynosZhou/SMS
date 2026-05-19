import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class TimetableService {
  private apiUrl = `${environment.apiUrl}/timetables`;
  private wizardData: any = {};

  constructor(private http: HttpClient) {}

  getTimetables(): Observable<any> {
    return this.http.get<any>(this.apiUrl);
  }

  getTimetableById(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  createTimetable(timetable: any): Observable<any> {
    return this.http.post<any>(this.apiUrl, timetable);
  }

  updateTimetable(id: string, timetable: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, timetable);
  }

  deleteTimetable(id: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${id}`);
  }

  // Wizard data management (local storage)
  saveWizardSubjects(subjects: any[]) {
    this.wizardData.subjects = subjects;
    localStorage.setItem('timetable_wizard_subjects', JSON.stringify(subjects));
  }

  getWizardSubjects(): any[] {
    const stored = localStorage.getItem('timetable_wizard_subjects');
    return stored ? JSON.parse(stored) : null;
  }

  saveWizardClasses(classes: any[]) {
    this.wizardData.classes = classes;
    localStorage.setItem('timetable_wizard_classes', JSON.stringify(classes));
  }

  getWizardClasses(): any[] {
    const stored = localStorage.getItem('timetable_wizard_classes');
    return stored ? JSON.parse(stored) : null;
  }

  saveWizardTeachers(teachers: any[]) {
    this.wizardData.teachers = teachers;
    localStorage.setItem('timetable_wizard_teachers', JSON.stringify(teachers));
  }

  getWizardTeachers(): any[] {
    const stored = localStorage.getItem('timetable_wizard_teachers');
    return stored ? JSON.parse(stored) : null;
  }

  saveWizardData(data: any) {
    this.wizardData = data;
    localStorage.setItem('timetable_wizard_data', JSON.stringify(data));
  }

  getWizardData(): any {
    const stored = localStorage.getItem('timetable_wizard_data');
    return stored ? JSON.parse(stored) : this.wizardData;
  }

  clearWizardData() {
    this.wizardData = {};
    localStorage.removeItem('timetable_wizard_subjects');
    localStorage.removeItem('timetable_wizard_classes');
    localStorage.removeItem('timetable_wizard_teachers');
    localStorage.removeItem('timetable_wizard_data');
  }

  // Configuration methods
  getTimetableConfig(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/config/active`);
  }

  saveTimetableConfig(config: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/config`, config);
  }

  // Generation methods
  generateTimetable(timetableId: string, configId: string, assignments?: any[]): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/generate`, {
      timetableId,
      configId,
      assignments
    });
  }

  detectConflicts(timetableId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${timetableId}/conflicts`);
  }

  getAssignments(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/assignments/all`);
  }

  // Version methods
  getTimetableVersions(timetableId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${timetableId}/versions`);
  }

  createTimetableVersion(timetableId: string, description?: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/${timetableId}/versions`, { description });
  }

  logTimetableChange(versionId: string, change: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/versions/${versionId}/changes`, change);
  }

  // Manual entry management
  createEntryManual(entry: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/entries/manual`, entry);
  }

  updateEntryManual(id: string, entry: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/entries/${id}/manual`, entry);
  }

  toggleEntryLock(id: string, isLocked: boolean): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/entries/${id}/lock`, { isLocked });
  }
}

