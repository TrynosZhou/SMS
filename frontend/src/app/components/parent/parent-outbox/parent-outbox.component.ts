import { Component, OnInit } from '@angular/core';
import { MessageService } from '../../../services/message.service';
import { AuthService } from '../../../services/auth.service';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-parent-outbox',
  templateUrl: './parent-outbox.component.html',
  styleUrls: ['./parent-outbox.component.css']
})
export class ParentOutboxComponent implements OnInit {
  messages: any[] = [];
  selected: any | null = null;
  loading = false;
  error = '';
  parentName = '';

  constructor(
    private messageService: MessageService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    const user = this.authService.getCurrentUser();
    if (user?.parent) {
      this.parentName = `${user.parent.firstName || ''} ${user.parent.lastName || ''}`.trim() || 'Parent';
    } else {
      this.parentName = 'Parent';
    }
  }

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.error = '';
    this.messageService.getParentOutbox().subscribe({
      next: (res: any) => {
        this.messages = res?.messages || [];
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to load sent messages';
      }
    });
  }

  open(msg: any) {
    this.selected = msg;
  }

  formatDate(d: string): string {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleString();
  }

  logout() {
    this.authService.logout();
  }
}
