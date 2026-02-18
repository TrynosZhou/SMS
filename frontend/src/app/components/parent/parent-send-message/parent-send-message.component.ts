import { Component } from '@angular/core';
import { MessageService } from '../../../services/message.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-parent-send-message',
  templateUrl: './parent-send-message.component.html',
  styleUrls: ['./parent-send-message.component.css']
})
export class ParentSendMessageComponent {
  recipient: 'admin' | 'accountant' = 'admin';
  subject = '';
  body = '';
  loading = false;
  error = '';
  success = '';
  parentName = '';
  attachments: File[] = [];

  constructor(private messageService: MessageService, private authService: AuthService) {
    const user = this.authService.getCurrentUser();
    if (user?.parent) {
      this.parentName = `${user.parent.firstName || ''} ${user.parent.lastName || ''}`.trim() || 'Parent';
    } else {
      this.parentName = 'Parent';
    }
  }

  canSend(): boolean {
    return !!this.subject.trim() && !!this.body.trim() && !!this.recipient;
  }

  send() {
    if (!this.canSend()) {
      this.error = 'Please complete all fields.';
      return;
    }
    this.loading = true;
    this.error = '';
    this.success = '';
    const subj = this.subject.trim();
    const msg = this.body.trim();
    const files = this.attachments || [];
    const req$ = files.length > 0
      ? this.messageService.sendParentMessageWithAttachments(this.recipient, subj, msg, files)
      : this.messageService.sendParentMessage(this.recipient, subj, msg);
    req$.subscribe({
      next: (res: any) => {
        this.loading = false;
        this.success = res?.message || 'Message sent successfully';
        this.subject = '';
        this.body = '';
        this.attachments = [];
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to send message';
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
