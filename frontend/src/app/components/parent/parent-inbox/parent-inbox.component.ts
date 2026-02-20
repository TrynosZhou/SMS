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
  replyingForId: string | null = null;
  replyRecipient: 'admin' | 'accountant' = 'admin';
  replySubject = '';
  replyBody = '';
  sending = false;
  success = '';
  attachments: File[] = [];

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

  openReply(m: any) {
    this.replyingForId = m?.id || null;
    this.replyRecipient = 'admin';
    this.replySubject = `Re: ${m?.subject || ''}`.trim();
    this.replyBody = '';
    this.success = '';
    this.error = '';
    this.attachments = [];
  }

  cancelReply() {
    this.replyingForId = null;
    this.replyRecipient = 'admin';
    this.replySubject = '';
    this.replyBody = '';
    this.sending = false;
    this.attachments = [];
  }

  sendReply() {
    if (!this.replyingForId) return;
    const subject = (this.replySubject || '').trim();
    const body = (this.replyBody || '').trim();
    if (!subject || !body) {
      this.error = 'Please enter subject and message before sending';
      setTimeout(() => this.error = '', 4000);
      return;
    }
    this.sending = true;
    this.error = '';
    this.success = '';
    const hasFiles = this.attachments.length > 0;
    const obs = hasFiles
      ? this.messageService.sendParentMessageWithAttachments(this.replyRecipient, subject, body, this.attachments)
      : this.messageService.sendParentMessage(this.replyRecipient, subject, body);
    obs.subscribe({
      next: (res: any) => {
        this.sending = false;
        this.success = res?.message || 'Reply sent successfully';
        setTimeout(() => this.success = '', 4000);
        this.cancelReply();
      },
      error: (err: any) => {
        this.sending = false;
        this.error = err?.error?.message || 'Failed to send reply';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  onFileChange(event: any) {
    const files: FileList = event.target.files;
    this.attachments = [];
    for (let i = 0; i < files.length; i++) {
      const f = files.item(i)!;
      this.attachments.push(f);
    }
  }

  removeAttachment(index: number) {
    this.attachments.splice(index, 1);
  }

  logout() {
    this.authService.logout();
  }
}

