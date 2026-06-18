import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { MessageService } from './message.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class IncomingMessageNotificationService {
  private readonly countSubject = new BehaviorSubject<number>(0);
  readonly unreadCount$ = this.countSubject.asObservable();

  constructor(
    private messageService: MessageService,
    private authService: AuthService
  ) {}

  get unreadCount(): number {
    return this.countSubject.value;
  }

  /** Staff roles that receive parent messages in admin/accountant inbox boxes. */
  canShowIncomingBadge(): boolean {
    const role = (this.authService.getEffectiveRole() || '').toLowerCase();
    return ['admin', 'superadmin', 'director', 'accountant', 'headmaster', 'deputy_headmaster'].includes(role);
  }

  getIncomingBox(): 'admin' | 'accountant' | null {
    if (!this.canShowIncomingBadge()) {
      return null;
    }
    const role = (this.authService.getEffectiveRole() || '').toLowerCase();
    return role === 'accountant' ? 'accountant' : 'admin';
  }

  refresh(): Observable<number> {
    const box = this.getIncomingBox();
    if (!box) {
      this.countSubject.next(0);
      return of(0);
    }
    return this.messageService.getIncomingFromParentsUnreadCount(box).pipe(
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
