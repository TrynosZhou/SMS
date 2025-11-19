import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AccountService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getAccountInfo(): Observable<any> {
    return this.http.get(`${this.apiUrl}/account`);
  }

  updateAccount(data: { newUsername?: string; newEmail?: string; currentPassword: string; newPassword: string }): Observable<any> {
    return this.http.put(`${this.apiUrl}/account`, data);
  }

  createUserAccount(data: {
    email: string;
    username?: string;
    role: string;
    password?: string;
    generatePassword?: boolean;
    isDemo?: boolean;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/account/users`, data);
  }
}

