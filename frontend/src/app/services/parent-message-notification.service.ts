import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { MessageService } from './message.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ParentMessageNotificationService {
  private readonly countSubject = new BehaviorSubject<number>(0);
  readonly unreadCount$ = this.countSubject.asObservable();

  constructor(
    private messageService: MessageService,
    private authService: AuthService
  ) {}

  get unreadCount(): number {
    return this.countSubject.value;
  }

  canShowParentInboxBadge(): boolean {
    return this.authService.isParent();
  }

  refresh(): Observable<number> {
    if (!this.canShowParentInboxBadge()) {
      this.countSubject.next(0);
      return of(0);
    }
    return this.messageService.getParentInboxUnreadCount().pipe(
      map((res) => Math.max(0, Number(res?.count) || 0)),
      tap((count) => this.countSubject.next(count)),
      catchError(() => {
        this.countSubject.next(0);
        return of(0);
      })
    );
  }

  setCount(count: number): void {
    this.countSubject.next(Math.max(0, count));
  }
}
