import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  ReportCardOutreachService,
  UnviewedParent,
  UnviewedChild,
  NotifyParentResponse
} from '../../../services/report-card-outreach.service';
import { pdfReportCardViewerUrl } from '../../../utils/pdf-preview.util';

interface SendState {
  loading: boolean;
  result: NotifyParentResponse | null;
  error: string | null;
}

interface PdfPreviewState {
  loading: boolean;
  blobUrl: string | null;
  safeUrl: SafeResourceUrl | null;
  error: string | null;
  studentName: string;
  examTypeLabel: string;
  term: string;
}
@Component({
  standalone: false,
  selector: 'app-report-card-outreach',
  templateUrl: './report-card-outreach.component.html',
  styleUrls: ['./report-card-outreach.component.css']
})
export class ReportCardOutreachComponent implements OnInit, OnDestroy {
  parents: UnviewedParent[] = [];
  totalParents = 0;
  totalUnviewed = 0;
  loading = false;
  error = '';

  // Server-side filters
  termFilter = '';
  examTypeFilter = ''; // '' = all exam types
  readonly examTypeOptions = [
    { value: '', label: 'All exam types' },
    { value: 'mid_term', label: 'Mid-Term' },
    { value: 'end_term', label: 'End-Term' }
  ];
  readonly termOptions = [
    { value: '', label: 'All terms' },
    { value: 'Term 1', label: 'Term 1' },
    { value: 'Term 2', label: 'Term 2' },
    { value: 'Term 3', label: 'Term 3' }
  ];

  // Client-side search within the loaded list
  searchQuery = '';

  selectedParentId: string | null = null;
  /** Per-child send state, keyed by `${parentId}|${studentId}|${examType}|${term}`. */
  private sendStates = new Map<string, SendState>();
  /** Per-child send-report-card state, keyed same way. */
  private sendPdfStates = new Map<string, SendState>();

  // PDF Preview modal state
  pdfPreview: PdfPreviewState | null = null;

  constructor(
    private outreachService: ReportCardOutreachService,
    private sanitizer: DomSanitizer,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadParents();
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.revokePdfPreviewUrl();
  }

  loadParents(): void {
    this.loading = true;
    this.error = '';
    this.cdr.detectChanges();
    this.outreachService.getUnviewedParents(this.termFilter, this.examTypeFilter).subscribe({
      next: (res) => {
        this.parents = res.parents || [];
        this.totalParents = res.totalParents || 0;
        this.totalUnviewed = res.totalUnviewed || 0;
        this.loading = false;
        // Preserve the current selection if it is still present; otherwise
        // auto-select the first parent for convenience.
        const stillSelected = this.selectedParentId
          ? this.parents.find((p) => p.parentId === this.selectedParentId)
          : null;
        if (!stillSelected) {
          this.selectedParentId = this.parents.length ? this.parents[0].parentId : null;
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = err?.error?.message || err?.message || 'Failed to load parents.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  onFilterChange(): void {
    this.selectedParentId = null;
    this.sendStates.clear();
    this.loadParents();
  }

  selectParent(parentId: string): void {
    this.selectedParentId = parentId;
  }

  get selectedParent(): UnviewedParent | null {
    if (!this.selectedParentId) return null;
    return this.parents.find((p) => p.parentId === this.selectedParentId) || null;
  }

  get filteredParents(): UnviewedParent[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.parents;
    return this.parents.filter(
      (p) =>
        (p.parentName || '').toLowerCase().includes(q) ||
        (p.phoneNumber || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q)
    );
  }

  get contactableCount(): number {
    return this.parents.filter((p) => !!p.phoneNumber).length;
  }

  sendViaWhatsApp(parent: UnviewedParent, child: UnviewedChild): void {
    const key = this.childKey(parent.parentId, child);
    this.sendStates.set(key, { loading: true, result: null, error: null });
    this.outreachService
      .notifyParent(parent.parentId, child.studentId, child.examType, child.term)
      .subscribe({
        next: (result) => this.sendStates.set(key, { loading: false, result, error: null }),
        error: (err) => {
          const message = err?.error?.message || err?.message || 'Failed to send notification.';
          this.sendStates.set(key, { loading: false, result: null, error: message });
        }
      });
  }

  sendReportCard(parent: UnviewedParent, child: UnviewedChild): void {
    const key = this.childKey(parent.parentId, child);
    this.sendPdfStates.set(key, { loading: true, result: null, error: null });
    this.outreachService
      .sendReportCard(parent.parentId, child.studentId, child.classId, child.examType, child.term)
      .subscribe({
        next: (result) => this.sendPdfStates.set(key, { loading: false, result, error: null }),
        error: (err) => {
          const message = err?.error?.message || err?.message || 'Failed to send report card.';
          this.sendPdfStates.set(key, { loading: false, result: null, error: message });
        }
      });
  }

  getSendState(parent: UnviewedParent, child: UnviewedChild): SendState {
    const key = this.childKey(parent.parentId, child);
    return this.sendStates.get(key) || { loading: false, result: null, error: null };
  }

  getSendPdfState(parent: UnviewedParent, child: UnviewedChild): SendState {
    const key = this.childKey(parent.parentId, child);
    return this.sendPdfStates.get(key) || { loading: false, result: null, error: null };
  }

  // ── PDF Preview ──────────────────────────────────────────────────────
  previewPdf(child: UnviewedChild): void {
    this.revokePdfPreviewUrl();
    this.pdfPreview = {
      loading: true,
      blobUrl: null,
      safeUrl: null,
      error: null,
      studentName: child.studentName,
      examTypeLabel: child.examTypeLabel,
      term: child.term
    };

    // Use the fast admin preview endpoint (parallelised queries, no fee check).
    this.outreachService
      .previewReportCardPdf(child.studentId, child.classId, child.examType, child.term)
      .subscribe({
        next: (blob: Blob) => {
          const url = URL.createObjectURL(blob);
          const safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
            pdfReportCardViewerUrl(url)
          );
          this.pdfPreview = {
            loading: false,
            blobUrl: url,
            safeUrl,
            error: null,
            studentName: child.studentName,
            examTypeLabel: child.examTypeLabel,
            term: child.term
          };
        },
        error: (err: any) => {
          let msg =
            err?.error?.message ||
            err?.message ||
            'Could not generate the report card PDF.';
          // err.error is a Blob when responseType is blob and the server
          // returns JSON — parse it to extract the message.
          if (err?.error instanceof Blob) {
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const body = JSON.parse(reader.result as string);
                msg = body?.message || msg;
              } catch { /* keep original msg */ }
              this.pdfPreview = {
                loading: false, blobUrl: null, safeUrl: null,
                error: msg,
                studentName: child.studentName,
                examTypeLabel: child.examTypeLabel,
                term: child.term
              };
            };
            reader.readAsText(err.error);
            return;
          }
          this.pdfPreview = {
            loading: false,
            blobUrl: null,
            safeUrl: null,
            error: msg,
            studentName: child.studentName,
            examTypeLabel: child.examTypeLabel,
            term: child.term
          };
        }
      });
  }

  closePdfPreview(): void {
    this.revokePdfPreviewUrl();
    this.pdfPreview = null;
  }

  private revokePdfPreviewUrl(): void {
    if (this.pdfPreview?.blobUrl) {
      URL.revokeObjectURL(this.pdfPreview.blobUrl);
    }
  }

  close(): void {
    this.router.navigate(['/dashboard']);
  }

  initials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('') || '?';
  }

  private childKey(parentId: string, child: UnviewedChild): string {
    return `${parentId}|${child.studentId}|${child.examType}|${child.term}`;
  }
}
