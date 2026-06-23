import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import { ParentMessageNotificationService } from '../../../services/parent-message-notification.service';

@Component({
  standalone: false,
  selector: 'app-parent-portal-sidebar',
  templateUrl: './parent-portal-sidebar.component.html',
  styleUrls: ['./parent-portal-sidebar.component.css']
})
export class ParentPortalSidebarComponent implements OnInit, OnDestroy {
  @Input() collapsed = false;

  messagesGroupOpen = false;
  academicGroupOpen = false;
  unreadMessageCount = 0;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private authService: AuthService,
    private parentMessageNotifications: ParentMessageNotificationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.syncGroupsFromUrl(this.router.url);
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe((event) => this.syncGroupsFromUrl(event.urlAfterRedirects));

    this.parentMessageNotifications.unreadCount$
      .pipe(takeUntil(this.destroy$))
      .subscribe((count) => {
        this.unreadMessageCount = count;
        this.cdr.markForCheck();
      });
    this.parentMessageNotifications.refresh().pipe(takeUntil(this.destroy$)).subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get canManageAccount(): boolean {
    return this.authService.canChangeOwnPassword();
  }

  get parentPortalLabel(): string {
    const user = this.authService.getCurrentUser();
    if (user?.parent) {
      const name = [user.parent.firstName, user.parent.lastName].filter(Boolean).join(' ').trim();
      if (name) {
        return name;
      }
    }
    return user?.fullName?.trim() || 'Parent';
  }

  getInboxBadgeLabel(): string {
    const n = this.unreadMessageCount;
    if (n <= 0) {
      return '';
    }
    return n > 99 ? '99+' : String(n);
  }

  toggleNavGroup(group: 'messages' | 'academic'): void {
    if (this.collapsed) {
      return;
    }
    if (group === 'messages') {
      const opening = !this.messagesGroupOpen;
      this.messagesGroupOpen = opening;
      if (opening) {
        this.academicGroupOpen = false;
      }
    } else {
      const opening = !this.academicGroupOpen;
      this.academicGroupOpen = opening;
      if (opening) {
        this.messagesGroupOpen = false;
      }
    }
    this.cdr.markForCheck();
  }

  private syncGroupsFromUrl(url: string): void {
    const path = (url || '').split('?')[0];
    const messagesActive = path.startsWith('/parent/inbox')
      || path.startsWith('/parent/send-message')
      || path.startsWith('/parent/outbox');
    const academicActive = path.startsWith('/parent/invoice-statement')
      || path.startsWith('/parent/student-portal')
      || path.startsWith('/parent/link-students');

    if (messagesActive) {
      this.messagesGroupOpen = true;
      this.academicGroupOpen = false;
    } else if (academicActive) {
      this.academicGroupOpen = true;
      this.messagesGroupOpen = false;
    } else {
      this.messagesGroupOpen = false;
      this.academicGroupOpen = false;
    }
    this.cdr.markForCheck();
  }
}
