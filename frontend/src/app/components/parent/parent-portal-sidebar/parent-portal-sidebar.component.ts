import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import { ParentMessageNotificationService } from '../../../services/parent-message-notification.service';
import { ParentService } from '../../../services/parent.service';

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
  parentDisplayName = 'Parent';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private authService: AuthService,
    private parentService: ParentService,
    private parentMessageNotifications: ParentMessageNotificationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.resolveParentDisplayNameFromSession();
    this.loadParentDisplayName();

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

  private loadParentDisplayName(): void {
    this.parentService.getCurrentProfile().pipe(takeUntil(this.destroy$)).subscribe({
      next: (profile) => {
        const name = this.formatParentFullName(profile);
        if (name) {
          this.parentDisplayName = name;
          this.cdr.markForCheck();
        }
      },
      error: () => {
        // keep session fallback
      },
    });
  }

  private resolveParentDisplayNameFromSession(): void {
    const user = this.authService.getCurrentUser();
    const fromParent = this.formatParentFullName(user?.parent);
    if (fromParent) {
      this.parentDisplayName = fromParent;
      return;
    }

    const fromUser = this.formatParentFullName({
      firstName: user?.firstName,
      lastName: user?.lastName,
      fullName: user?.fullName,
      email: user?.email,
      username: user?.username,
    });
    if (fromUser) {
      this.parentDisplayName = fromUser;
    }
  }

  private formatParentFullName(data: {
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    email?: string | null;
    username?: string | null;
  } | null | undefined): string {
    if (!data) {
      return '';
    }

    const lastName = String(data.lastName || '').trim();
    const firstName = String(data.firstName || '').trim();
    const fromParts = `${lastName} ${firstName}`.trim();
    if (fromParts) {
      return fromParts;
    }

    const fullName = String(data.fullName || '').trim();
    if (fullName && !this.isEmailOrUsernameLabel(fullName, data.email, data.username)) {
      return fullName;
    }

    return '';
  }

  private isEmailOrUsernameLabel(
    value: string,
    email?: string | null,
    username?: string | null
  ): boolean {
    const label = value.trim().toLowerCase();
    if (!label) {
      return true;
    }
    if (label.includes('@')) {
      return true;
    }

    const emailLocal = String(email || username || '').split('@')[0].trim().toLowerCase();
    if (emailLocal && label === emailLocal) {
      return true;
    }

    return false;
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
      || path.startsWith('/parent/results')
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
