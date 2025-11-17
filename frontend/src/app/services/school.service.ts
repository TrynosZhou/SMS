import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SchoolPayload {
  name: string;
  code: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  subscriptionEndDate?: string;
  isActive?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SchoolService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getCurrentSchoolProfile(): Observable<any> {
    return this.http.get(`${this.apiUrl}/schools/profile`);
  }

  getSchools(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/schools`);
  }

  createSchool(payload: SchoolPayload): Observable<any> {
    return this.http.post(`${this.apiUrl}/schools`, payload);
  }

  updateSchool(id: string, payload: SchoolPayload): Observable<any> {
    return this.http.patch(`${this.apiUrl}/schools/${id}`, payload);
  }

  generateSchoolCode(): Observable<{ code: string }> {
    return this.http.post<{ code: string }>(`${this.apiUrl}/schools/generate-code`, {});
  }
}


