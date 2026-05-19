import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/** Notifies student list views to reload after create/update/delete. */
@Injectable({ providedIn: 'root' })
export class StudentRefreshService {
  private readonly refreshSubject = new Subject<void>();

  requestRefresh(): void {
    this.refreshSubject.next();
  }

  onRefreshRequested() {
    return this.refreshSubject.asObservable();
  }
}
