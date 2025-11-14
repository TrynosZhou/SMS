import { Component, OnInit } from '@angular/core';
import { MessageService } from '../../../services/message.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-parent-inbox',
  templateUrl: './parent-inbox.component.html',
  styleUrls: ['./parent-inbox.component.css']
})
export class ParentInboxComponent implements OnInit {
  messages: any[] = [];
  loading = false;
  error = '';
  parentName = '';

  constructor(
    private messageService: MessageService,
    private authService: AuthService
  ) {
    const user = this.authService.getCurrentUser();
    if (user?.parent) {
      this.parentName = `${user.parent.firstName || ''} ${user.parent.lastName || ''}`.trim() || 'Parent';
    } else {
      this.parentName = 'Parent';
    }
  }

  ngOnInit() {
    this.loadMessages();
  }

  loadMessages() {
    this.loading = true;
    this.error = '';
    
    this.messageService.getParentMessages().subscribe({
      next: (response: any) => {
        this.messages = response.messages || [];
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
          setTimeout(() => {
            this.authService.logout();
          }, 2000);
        } else {
          this.error = err.error?.message || 'Failed to load messages';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  logout() {
    this.authService.logout();
  }
}

