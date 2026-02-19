import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MessageService } from '../../../services/message.service';
import { ParentService } from '../../../services/parent.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-send-message',
  templateUrl: './send-message.component.html',
  styleUrls: ['./send-message.component.css']
})
export class SendMessageComponent implements OnInit {
  subject = '';
  message = '';
  recipientsType: 'all' | 'selected' = 'all';
  parents: any[] = [];
  parentsSearch = '';
  selectedParentIds: Set<string> = new Set<string>();
  attachments: File[] = [];
  templates: { name: string; subject: string; body: string }[] = [
    { name: 'Fees Reminder', subject: 'Fees Reminder', body: 'Dear Parent,\n\nThis is a friendly reminder that school fees are due. Kindly settle the outstanding balance at your earliest convenience.\n\nThank you.' },
    { name: 'General Notice', subject: 'School Notice', body: 'Dear Parent,\n\nPlease note the following notice from the school:\n\n[Enter notice details here]\n\nRegards.' },
    { name: 'Receipt Attached', subject: 'Payment Receipt', body: 'Dear Parent,\n\nPlease find attached your payment receipt for your records.\n\nThank you.' }
  ];
  selectedTemplate = '';
  loading = false;
  error = '';
  success = '';
  constructor(private route: ActivatedRoute, private messageService: MessageService, private parentService: ParentService, private authService: AuthService) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(p => {
      const subj = p.get('subject') || '';
      const body = p.get('message') || '';
      if (subj) this.subject = subj;
      if (body) this.message = body;
    });
  }

  

  isAllowed(): boolean {
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    const role = (user.role || '').toLowerCase();
    return role === 'accountant' || role === 'admin' || role === 'superadmin';
  }

  loadParentsIfNeeded() {
    if (this.recipientsType === 'selected' && this.parents.length === 0) {
      const user = this.authService.getCurrentUser();
      const role = (user?.role || '').toLowerCase();
      const obs = role === 'accountant'
        ? this.parentService.getAllParentsStaff()
        : this.parentService.getAllParentsAdmin();
      obs.subscribe({
        next: (res: any) => {
          this.parents = res.parents || [];
        },
        error: () => {
          this.parents = [];
        }
      });
    }
  }

  onRecipientsTypeChange() {
    if (this.recipientsType === 'selected') {
      this.loadParentsIfNeeded();
    }
  }

  applyTemplate() {
    const t = this.templates.find(x => x.name === this.selectedTemplate);
    if (!t) return;
    if (!this.subject.trim()) {
      this.subject = t.subject;
    }
    if (!this.message.trim()) {
      this.message = t.body;
    }
  }

  toggleParentSelection(parentId: string) {
    if (this.selectedParentIds.has(parentId)) {
      this.selectedParentIds.delete(parentId);
    } else {
      this.selectedParentIds.add(parentId);
    }
  }

  onFileChange(event: any) {
    const files: FileList = event.target.files;
    this.attachments = [];
    for (let i = 0; i < files.length; i++) {
      const f = files.item(i)!;
      this.attachments.push(f);
    }
  }

  canSend(): boolean {
    if (!this.isAllowed()) return false;
    if (!this.subject.trim() || !this.message.trim()) return false;
    if (this.recipientsType === 'selected' && this.selectedParentIds.size === 0) return false;
    return true;
    }

  filteredParents(): any[] {
    const q = (this.parentsSearch || '').toLowerCase();
    if (!q) return this.parents;
    return this.parents.filter(p =>
      (p.firstName || '').toLowerCase().includes(q) ||
      (p.lastName || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.phoneNumber || '').toLowerCase().includes(q)
    );
  }

  send() {
    if (!this.canSend()) {
      this.error = 'Please complete the form before sending.';
      return;
    }
    this.loading = true;
    this.error = '';
    this.success = '';

    if (this.recipientsType === 'all') {
      const subject = this.subject.trim();
      const body = this.message.trim();
      if (this.attachments.length > 0) {
        this.messageService
          .sendBulkMessageWithAttachments(subject, body, 'parents', this.attachments)
          .subscribe({
            next: (res: any) => {
              this.loading = false;
              const count = res?.parentCount ?? res?.recipientCount ?? '';
              this.success = res?.message || (count ? `Message sent to ${count} parent(s).` : 'Message sent to all parents.');
              this.resetForm();
            },
            error: (err: any) => {
              this.loading = false;
              const msg = this.extractError(err);
              this.error = msg || 'Failed to send message';
            }
          });
      } else {
        this.messageService
          .sendBulkMessage({ subject, message: body, recipients: 'parents' })
          .subscribe({
            next: (res: any) => {
              this.loading = false;
              const count = res?.parentCount ?? res?.recipientCount ?? '';
              this.success = res?.message || (count ? `Message sent to ${count} parent(s).` : 'Message sent to all parents.');
              this.resetForm();
            },
            error: (err: any) => {
              this.loading = false;
              const msg = this.extractError(err);
              this.error = msg || 'Failed to send message';
            }
          });
      }
    } else {
      const ids = Array.from(this.selectedParentIds);
      const subject = this.subject.trim();
      const body = this.message.trim();
      if (this.attachments.length > 0) {
        this.messageService
          .sendMessageToSpecificParents(subject, body, ids, this.attachments)
          .subscribe({
            next: (res: any) => {
              this.loading = false;
              const sent = res?.sent ?? ids.length;
              this.success = res?.message || `Message sent to ${sent} selected parent(s).`;
              this.resetForm();
            },
            error: (err: any) => {
              this.loading = false;
              const msg = this.extractError(err);
              this.error = msg || 'Failed to send message';
            }
          });
      } else {
        this.messageService
          .sendMessageToSpecificParentsJSON(subject, body, ids)
          .subscribe({
            next: (res: any) => {
              this.loading = false;
              const sent = res?.sent ?? ids.length;
              this.success = res?.message || `Message sent to ${sent} selected parent(s).`;
              this.resetForm();
            },
            error: (err: any) => {
              this.loading = false;
              const msg = this.extractError(err);
              this.error = msg || 'Failed to send message';
            }
          });
      }
    }
  }

  private extractError(err: any): string {
    try {
      if (!err) return '';
      if (typeof err.error === 'string') return err.error;
      const parts: string[] = [];
      if (err.status) parts.push(`Status: ${err.status}`);
      if (err.error?.message) parts.push(err.error.message);
      if (Array.isArray(err.error?.errors)) {
        parts.push(err.error.errors.map((e: any) => e.msg || e.message || JSON.stringify(e)).join('; '));
      }
      if (err.error?.details) {
        parts.push(typeof err.error.details === 'string' ? err.error.details : JSON.stringify(err.error.details));
      }
      return parts.filter(Boolean).join(' | ');
    } catch {
      return '';
    }
  }

  removeAttachment(index: number) {
    this.attachments.splice(index, 1);
  }

  resetForm() {
    this.subject = '';
    this.message = '';
    this.recipientsType = 'all';
    this.selectedParentIds.clear();
    this.attachments = [];
  }
}
