import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class MessageService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  sendBulkMessage(messageData: { subject: string; message: string; recipients: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/bulk`, messageData);
  }

  sendBulkMessageWithAttachments(subject: string, message: string, recipients: string, files: File[] = []): Observable<any> {
    const form = new FormData();
    form.append('subject', subject);
    form.append('message', message);
    form.append('recipients', recipients);
    form.append('audience', recipients);
    files.forEach(f => {
      form.append('attachments', f);
      form.append('files', f);
    });
    return this.http.post(`${this.apiUrl}/messages/bulk`, form);
  }

  sendMessageToSpecificParents(subject: string, message: string, parentIds: string[], files: File[] = []): Observable<any> {
    const form = new FormData();
    form.append('subject', subject);
    form.append('message', message);
    parentIds.forEach(id => {
      form.append('parentIds', id);
      form.append('parent_ids', id);
      form.append('parents', id);
    });
    files.forEach(f => {
      form.append('attachments', f);
      form.append('files', f);
    });
    return this.http.post(`${this.apiUrl}/messages/send`, form);
  }

  sendMessageToSpecificParentsJSON(subject: string, message: string, parentIds: string[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/send`, {
      subject,
      message,
      parentIds
    });
  }

  getParentMessages(): Observable<any> {
    return this.http.get(`${this.apiUrl}/messages/parent`);
  }

  sendParentMessage(recipient: 'admin' | 'accountant', subject: string, message: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/parent/send`, {
      recipient,
      subject,
      message
    });
  }

  sendParentMessageWithAttachments(recipient: 'admin' | 'accountant', subject: string, message: string, files: File[]): Observable<any> {
    const form = new FormData();
    form.append('recipient', recipient);
    form.append('subject', subject);
    form.append('message', message);
    files.forEach(f => form.append('attachments', f));
    return this.http.post(`${this.apiUrl}/messages/parent/send`, form);
  }

  getParentOutbox(): Observable<any> {
    return this.http.get(`${this.apiUrl}/messages/parent/outbox`);
  }

  getParentOutboxById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/messages/parent/outbox/${id}`);
  }

  getIncomingFromParents(box: 'admin' | 'accountant'): Observable<any> {
    return this.http.get(`${this.apiUrl}/messages/incoming/parents`, { params: { box } as any });
  }

  markIncomingRead(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/incoming/${id}/read`, {});
  }

  markIncomingUnread(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/incoming/${id}/unread`, {});
  }

  replyToIncoming(id: string, subject: string, message: string, files: File[] = []): Observable<any> {
    const form = new FormData();
    form.append('subject', subject);
    form.append('message', message);
    files.forEach(f => form.append('attachments', f));
    return this.http.post(`${this.apiUrl}/messages/incoming/${id}/reply`, form);
  }

  getStaffMessages(box: 'accountant' | 'admin' | 'teacher' = 'accountant'): Observable<any> {
    const candidates = environment.messages?.staffInboxCandidates || [
      '/messages/staff?box=accountant',
      '/messages/accountant/inbox',
      '/messages/inbox?role=accountant',
      '/accountant/messages',
      '/accountant/inbox',
      '/messages/staff/accountant'
    ];
    const tryUrl = (i: number): Observable<any> => {
      if (i >= candidates.length) {
        return of([]);
      }
      const path = candidates[i];
      let url = `${this.apiUrl}${path.startsWith('/') ? '' : '/'}${path}`;
      url = url.replace('{role}', box);
      return this.http.get(url).pipe(
        catchError(err => {
          if (err?.status === 404) {
            return tryUrl(i + 1);
          }
          return throwError(() => err);
        })
      );
    };
    return tryUrl(0);
  }
}
