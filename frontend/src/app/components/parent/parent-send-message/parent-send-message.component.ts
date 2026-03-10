import { Component, OnInit } from '@angular/core';
import { MessageService } from '../../../services/message.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-parent-send-message',
  templateUrl: './parent-send-message.component.html',
  styleUrls: ['./parent-send-message.component.css']
})
export class ParentSendMessageComponent implements OnInit {
  recipient: 'admin' | 'accountant' = 'admin';
  subject = '';
  body = '';
  loading = false;
  error = '';
  success = '';
  parentName = '';
  attachments: File[] = [];
  isDragging = false;
  readonly charLimit = 2000;

  templates = [
    { label: 'Fee Enquiry', subject: 'Fee Balance Enquiry', body: "Dear Administrator,\n\nI would like to enquire about my child's current fee balance and any outstanding payments.\n\nPlease advise at your earliest convenience.\n\nThank you." },
    { label: 'Absence Notice', subject: 'Notice of Absence', body: 'Dear Administrator,\n\nI wish to inform the school that my child will be absent on [date] due to [reason].\n\nPlease note this accordingly.\n\nThank you.' },
    { label: 'General Enquiry', subject: 'General Enquiry', body: 'Dear Administrator,\n\nI am writing to enquire about [topic]. Could you please provide more information at your earliest convenience?\n\nThank you.' }
  ];

  constructor(private messageService: MessageService, private authService: AuthService) {}

  ngOnInit() {
    const user = this.authService.getCurrentUser();
    if (user?.parent) {
      this.parentName = `${user.parent.firstName || ''} ${user.parent.lastName || ''}`.trim() || 'Parent';
    } else {
      this.parentName = 'Parent';
    }
  }

  get charCount(): number { return this.body.length; }
  get charClass(): string {
    if (this.charCount > this.charLimit * 0.9) return 'danger';
    if (this.charCount > this.charLimit * 0.75) return 'warn';
    return 'ok';
  }

  canSend(): boolean {
    return !!this.subject.trim() && !!this.body.trim() && !!this.recipient && this.charCount <= this.charLimit;
  }

  applyTemplate(t: { subject: string; body: string }) {
    this.subject = t.subject;
    this.body = t.body;
  }

  send() {
    if (!this.canSend()) {
      this.error = 'Please fill in the subject and message.';
      setTimeout(() => this.error = '', 4000);
      return;
    }
    this.loading = true;
    this.error = '';
    this.success = '';
    const req$ = this.attachments.length > 0
      ? this.messageService.sendParentMessageWithAttachments(this.recipient, this.subject.trim(), this.body.trim(), this.attachments)
      : this.messageService.sendParentMessage(this.recipient, this.subject.trim(), this.body.trim());
    req$.subscribe({
      next: (res: any) => {
        this.loading = false;
        this.success = res?.message || 'Message sent successfully!';
        this.subject = '';
        this.body = '';
        this.attachments = [];
        setTimeout(() => this.success = '', 6000);
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to send message.';
        setTimeout(() => this.error = '', 6000);
      }
    });
  }

  onFileChange(event: any) {
    this.addFiles(Array.from(event.target.files as FileList));
    event.target.value = '';
  }

  onDragOver(e: DragEvent) { e.preventDefault(); this.isDragging = true; }
  onDragLeave(e: DragEvent) { e.preventDefault(); this.isDragging = false; }
  onDrop(e: DragEvent) {
    e.preventDefault();
    this.isDragging = false;
    this.addFiles(Array.from(e.dataTransfer?.files || []));
  }

  private addFiles(files: File[]) {
    files.forEach(f => {
      if (!this.attachments.find(a => a.name === f.name && a.size === f.size)) {
        this.attachments.push(f);
      }
    });
  }

  removeAttachment(i: number) { this.attachments.splice(i, 1); }

  formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  fileIcon(name: string): string {
    const e = name.split('.').pop()?.toLowerCase();
    const m: Record<string, string> = { pdf: '??', doc: '??', docx: '??', xls: '??', xlsx: '??', jpg: '??', jpeg: '??', png: '??', gif: '??', zip: '??', txt: '??' };
    return m[e || ''] || '??';
  }

  logout() { this.authService.logout(); }
}
