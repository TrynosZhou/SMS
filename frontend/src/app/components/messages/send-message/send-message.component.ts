import { Component, OnInit, HostListener, ViewChild, ElementRef } from '@angular/core';
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
  
  templates: { name: string; subject: string; body: string; icon: string; preview: string }[] = [
    { 
      name: 'Fees Reminder', 
      subject: 'Fees Reminder', 
      body: 'Dear Parent,\n\nThis is a friendly reminder that school fees are due. Kindly settle the outstanding balance at your earliest convenience.\n\nThank you.',
      icon: '💰',
      preview: 'Reminder about outstanding fees...'
    },
    { 
      name: 'General Notice', 
      subject: 'School Notice', 
      body: 'Dear Parent,\n\nPlease note the following notice from the school:\n\n[Enter notice details here]\n\nRegards.',
      icon: '📢',
      preview: 'Important school announcement...'
    },
    { 
      name: 'Receipt Attached', 
      subject: 'Payment Receipt', 
      body: 'Dear Parent,\n\nPlease find attached your payment receipt for your records.\n\nThank you.',
      icon: '🧾',
      preview: 'Payment receipt notification...'
    },
    { 
      name: 'Event Invitation', 
      subject: 'School Event Invitation', 
      body: 'Dear Parent,\n\nYou are cordially invited to attend:\n\nEvent: [Event Name]\nDate: [Date]\nTime: [Time]\nVenue: [Venue]\n\nWe look forward to seeing you there.\n\nRegards.',
      icon: '🎉',
      preview: 'Invitation to school event...'
    },
    { 
      name: 'Academic Update', 
      subject: 'Academic Progress Update', 
      body: 'Dear Parent,\n\nWe would like to update you on your child\'s academic progress.\n\n[Enter details here]\n\nPlease feel free to contact us for any concerns.\n\nRegards.',
      icon: '📚',
      preview: 'Update on student progress...'
    }
  ];
  
  selectedTemplate = '';
  loading = false;
  loadingParents = false;
  error = '';
  success = '';
  showPreview = false;
  isDragOver = false;

  @ViewChild('fileInput') fileInput!: ElementRef;

  constructor(
    private route: ActivatedRoute, 
    private messageService: MessageService, 
    private parentService: ParentService, 
    private authService: AuthService
  ) {}

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.showPreview) {
      this.closePreview();
    }
  }

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

  loadParentsIfNeeded(): void {
    if (this.parents.length === 0) {
      this.loadingParents = true;
      const user = this.authService.getCurrentUser();
      const role = (user?.role || '').toLowerCase();
      const obs = role === 'accountant'
        ? this.parentService.getAllParentsStaff()
        : this.parentService.getAllParentsAdmin();
      obs.subscribe({
        next: (res: any) => {
          this.parents = res.parents || [];
          this.loadingParents = false;
        },
        error: () => {
          this.parents = [];
          this.loadingParents = false;
        }
      });
    }
  }

  setRecipientsType(type: 'all' | 'selected'): void {
    this.recipientsType = type;
    if (type === 'selected') {
      this.loadParentsIfNeeded();
    }
  }

  onRecipientsTypeChange(): void {
    if (this.recipientsType === 'selected') {
      this.loadParentsIfNeeded();
    }
  }

  selectTemplate(t: any): void {
    this.selectedTemplate = t.name;
    this.subject = t.subject;
    this.message = t.body;
  }

  applyTemplate(): void {
    const t = this.templates.find(x => x.name === this.selectedTemplate);
    if (!t) return;
    if (!this.subject.trim()) {
      this.subject = t.subject;
    }
    if (!this.message.trim()) {
      this.message = t.body;
    }
  }

  getInitials(parent: any): string {
    const first = (parent.firstName || '')[0] || '';
    const last = (parent.lastName || '')[0] || '';
    return (first + last).toUpperCase() || '?';
  }

  toggleParentSelection(parentId: string): void {
    if (this.selectedParentIds.has(parentId)) {
      this.selectedParentIds.delete(parentId);
    } else {
      this.selectedParentIds.add(parentId);
    }
  }

  clearSelection(): void {
    this.selectedParentIds.clear();
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

  // File handling
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    
    const files = event.dataTransfer?.files;
    if (files) {
      this.addFiles(files);
    }
  }

  onFileChange(event: any): void {
    const files: FileList = event.target.files;
    this.addFiles(files);
  }

  addFiles(files: FileList): void {
    for (let i = 0; i < files.length; i++) {
      const f = files.item(i);
      if (f && !this.attachments.find(a => a.name === f.name)) {
        this.attachments.push(f);
      }
    }
  }

  removeAttachment(index: number): void {
    this.attachments.splice(index, 1);
  }

  getFileIcon(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const icons: { [key: string]: string } = {
      'pdf': '📄',
      'doc': '📝',
      'docx': '📝',
      'xls': '📊',
      'xlsx': '📊',
      'png': '🖼️',
      'jpg': '🖼️',
      'jpeg': '🖼️',
      'gif': '🖼️'
    };
    return icons[ext] || '📎';
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  insertText(before: string, after: string): void {
    const textarea = document.getElementById('message') as HTMLTextAreaElement;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = this.message.substring(start, end);
    
    this.message = this.message.substring(0, start) + before + selectedText + after + this.message.substring(end);
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    }, 0);
  }

  canSend(): boolean {
    if (!this.isAllowed()) return false;
    if (!this.subject.trim() || !this.message.trim()) return false;
    if (this.recipientsType === 'selected' && this.selectedParentIds.size === 0) return false;
    return true;
  }

  previewMessage(): void {
    if (!this.canSend()) {
      this.error = 'Please complete all required fields.';
      return;
    }
    this.showPreview = true;
  }

  closePreview(): void {
    this.showPreview = false;
  }

  sendFromPreview(): void {
    this.closePreview();
    this.send();
  }

  send(): void {
    if (!this.canSend()) {
      this.error = 'Please complete all required fields before sending.';
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
            next: (res: any) => this.handleSuccess(res),
            error: (err: any) => this.handleError(err)
          });
      } else {
        this.messageService
          .sendBulkMessage({ subject, message: body, recipients: 'parents' })
          .subscribe({
            next: (res: any) => this.handleSuccess(res),
            error: (err: any) => this.handleError(err)
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
            next: (res: any) => this.handleSuccess(res, ids.length),
            error: (err: any) => this.handleError(err)
          });
      } else {
        this.messageService
          .sendMessageToSpecificParentsJSON(subject, body, ids)
          .subscribe({
            next: (res: any) => this.handleSuccess(res, ids.length),
            error: (err: any) => this.handleError(err)
          });
      }
    }
  }

  private handleSuccess(res: any, selectedCount?: number): void {
    this.loading = false;
    const count = res?.savedMessageCount ?? res?.parentCount ?? res?.recipientCount ?? res?.sent ?? selectedCount ?? '';
    this.success = res?.message || (count ? `Message sent successfully to ${count} recipient(s)! 🎉` : 'Message sent successfully!');
    this.resetForm();
    
    setTimeout(() => {
      if (this.success.includes('successfully')) {
        this.success = '';
      }
    }, 5000);
  }

  private handleError(err: any): void {
    this.loading = false;
    const msg = this.extractError(err);
    this.error = msg || 'Failed to send message. Please try again.';
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

  resetForm(): void {
    this.subject = '';
    this.message = '';
    this.recipientsType = 'all';
    this.selectedParentIds.clear();
    this.attachments = [];
    this.selectedTemplate = '';
    this.parentsSearch = '';
  }
}
