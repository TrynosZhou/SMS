import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ElearningService } from '../../../services/elearning.service';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import html2canvas from 'html2canvas';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

type StampKey =
  | 'correct'
  | 'incorrect'
  | 'unclear'
  | 'ft'
  | 'rep'
  | 'ignore'
  | 'bod'
  | 'ty'
  | 'naq'
  | 'omission';

@Component({
  selector: 'app-mark-response',
  templateUrl: './mark-response.component.html',
  styleUrls: ['./mark-response.component.css'],
})
export class MarkResponseComponent implements OnInit {
  responseId = '';
  response: any | null = null;

  loading = false;
  saving = false;
  error: string | null = null;
  success: string | null = null;

  score: number | null = null;
  feedbackText = '';
  feedbackFile: File | null = null;

  // Student response preview (inside feedback area)
  studentAttachmentUrl: string | null = null;
  studentAttachmentKind: 'pdf' | 'image' | 'other' | null = null;
  pdfPageImages: string[] = [];
  pdfLoading = false;
  pdfError: string | null = null;
  previewZoom = 1; // 1.0 = 100%
  safeResponseText: SafeHtml | null = null;

  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;
  // Root element for the zoomed preview content (used both to size the overlay canvas
  // and to capture a combined screenshot (script + marks) for students.
  @ViewChild('previewContent') pageRootRef?: ElementRef<HTMLElement>;
  @ViewChild('pageMarkCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  // Digital pen state
  penColor = '#dc2626';
  penSize = 4;
  tool: 'pen' | 'eraser' | 'stamp' = 'pen';
  markerEnabled = false;
  selectedStampKey: StampKey = 'correct';
  private drawing = false;
  private lastX = 0;
  private lastY = 0;
  private history: string[] = [];
  private readonly maxHistory = 25;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private elearningService: ElearningService,
    private sanitizer: DomSanitizer
  ) {
    // Use a local worker served by Angular assets (no CDN/network dependency).
    (GlobalWorkerOptions as any).workerSrc = 'assets/pdf.worker.min.mjs';
  }

  ngOnInit(): void {
    this.responseId = String(this.route.snapshot.paramMap.get('responseId') || '').trim();
    if (!this.responseId) {
      this.error = 'Response id is missing.';
      return;
    }
    this.load();
  }

  ngAfterViewInit(): void {
    // Defer to ensure the element has real dimensions
    setTimeout(() => this.resizeCanvasToPage(), 0);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.resizeCanvasToPage();
  }

  back(): void {
    this.router.navigate(['/teacher/student-responses']);
  }

  onPickFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.feedbackFile = input.files && input.files.length ? input.files[0] : null;
  }

  removeFile(): void {
    this.feedbackFile = null;
    const el = this.fileInputRef?.nativeElement;
    if (el) el.value = '';
  }

  setTool(tool: 'pen' | 'eraser' | 'stamp'): void {
    this.tool = tool;
    // If teacher picks a tool, ensure marker is enabled so it can be used immediately.
    if (!this.markerEnabled) {
      this.toggleMarker();
    }
  }

  setStamp(key: StampKey): void {
    this.selectedStampKey = key;
    this.setTool('stamp');
  }

  toggleMarker(): void {
    this.markerEnabled = !this.markerEnabled;
    // Ensure overlay canvas is sized and ready when enabled
    if (this.markerEnabled) {
      this.resizeCanvasToPage();
      if (!this.history.length) this.pushHistory();
    }
  }

  undoStroke(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    if (this.history.length <= 1) {
      this.clearCanvas(false);
      return;
    }
    this.history.pop();
    const prev = this.history[this.history.length - 1];
    this.restoreFromDataUrl(prev);
  }

  clearCanvas(pushHistory = true): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (pushHistory) this.pushHistory();
  }

  private resizeCanvasToPage(): void {
    const canvas = this.canvasRef?.nativeElement;
    const root = this.pageRootRef?.nativeElement;
    if (!canvas) return;
    if (!root) return;

    // Preserve drawing while resizing
    const prev = canvas.toDataURL('image/png');

    // Cover the entire page content area so drawings stay aligned when scrolling.
    const width = Math.max(320, Math.floor(root.scrollWidth || root.clientWidth || 1024));
    const height = Math.max(480, Math.floor(root.scrollHeight || root.clientHeight || 720));

    // Set internal pixel size (devicePixelRatio for sharp lines)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    // Restore previous content
    this.restoreFromDataUrl(prev, true);
    // Ensure we at least have one history snapshot
    if (!this.history.length) this.pushHistory();
  }

  private getPointerPos(e: PointerEvent): { x: number; y: number } {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { x, y };
  }

  onPointerDown(e: PointerEvent): void {
    const canvas = this.canvasRef?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (!this.markerEnabled) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = this.getPointerPos(e);
    if (this.tool === 'stamp') {
      this.drawStamp(ctx, x, y, this.selectedStampKey);
      this.pushHistory();
      return;
    }

    this.drawing = true;
    this.lastX = x;
    this.lastY = y;

    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  onPointerMove(e: PointerEvent): void {
    const canvas = this.canvasRef?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!this.drawing || !canvas || !ctx) return;
    if (!this.markerEnabled) return;
    e.preventDefault();
    const { x, y } = this.getPointerPos(e);

    // Overlay is transparent; eraser clears pixels instead of painting white.
    if (this.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = this.penColor;
    }
    ctx.lineWidth = this.tool === 'eraser' ? Math.max(10, this.penSize * 3) : this.penSize;

    ctx.lineTo(x, y);
    ctx.stroke();
    this.lastX = x;
    this.lastY = y;
  }

  onPointerUp(e: PointerEvent): void {
    const canvas = this.canvasRef?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (!this.drawing) return;
    e.preventDefault();
    this.drawing = false;
    ctx.closePath();
    ctx.globalCompositeOperation = 'source-over';
    this.pushHistory();
  }

  private pushHistory(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const data = canvas.toDataURL('image/png');
    if (this.history.length && this.history[this.history.length - 1] === data) return;
    this.history.push(data);
    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }
  }

  private restoreFromDataUrl(dataUrl: string, silent = false): void {
    const canvas = this.canvasRef?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // draw in CSS pixels space (we set transform already)
      ctx.drawImage(img, 0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
      if (!silent) this.pushHistory();
    };
    img.src = dataUrl;
  }

  private canvasHasInk(): boolean {
    const canvas = this.canvasRef?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return false;
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return false;
    const img = ctx.getImageData(0, 0, w, h).data;
    // look for any non-transparent pixel
    for (let i = 3; i < img.length; i += 4) {
      if (img[i] !== 0) return true;
    }
    return false;
  }

  // ---- Stamps (from rubric image) ----
  // Keys correspond to the stamp buttons shown in the uploaded image.
  // (Correct, Incorrect, Unclear, Follow Through, Repetition, Ignore, Benefit of Doubt, Content too..., Not answered question, Omission)
  // Rendered as either an icon stamp or a boxed label.
  readonly stamps: Array<{
    key: StampKey;
    label: string;
    tooltip: string;
    kind: 'icon' | 'boxed' | 'lambda';
    color: string;
  }> = [
    { key: 'correct', label: '✓', tooltip: 'Correct point', kind: 'icon', color: '#16a34a' },
    { key: 'incorrect', label: '✗', tooltip: 'Incorrect point', kind: 'icon', color: '#dc2626' },
    { key: 'unclear', label: '?', tooltip: 'Unclear response', kind: 'icon', color: '#16a34a' },
    { key: 'ft', label: 'FT', tooltip: 'Follow through', kind: 'boxed', color: '#dc2626' },
    { key: 'rep', label: 'REP', tooltip: 'Repetition', kind: 'boxed', color: '#dc2626' },
    { key: 'omission', label: 'λ', tooltip: 'Omission', kind: 'lambda', color: '#dc2626' },
  ];

  private drawStamp(ctx: CanvasRenderingContext2D, x: number, y: number, key: StampKey): void {
    const stamp = this.stamps.find(s => s.key === key);
    if (!stamp) return;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    if (stamp.kind === 'icon') {
      ctx.fillStyle = stamp.color;
      ctx.font = '900 44px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(stamp.label, x, y);
      ctx.restore();
      return;
    }

    if (stamp.kind === 'lambda') {
      ctx.fillStyle = stamp.color;
      ctx.font = '900 52px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(stamp.label, x, y);
      ctx.restore();
      return;
    }

    // Boxed labels like FT/REP/I/BOD/T¥/NAQ
    const padX = 10;
    const padY = 6;
    ctx.font = '900 18px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    const metrics = ctx.measureText(stamp.label);
    const w = Math.ceil(metrics.width + padX * 2);
    const h = 30 + padY; // approximate height
    const rx = 6;

    const left = x - w / 2;
    const top = y - h / 2;

    ctx.strokeStyle = stamp.color;
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';

    // Rounded rect
    ctx.beginPath();
    ctx.moveTo(left + rx, top);
    ctx.lineTo(left + w - rx, top);
    ctx.quadraticCurveTo(left + w, top, left + w, top + rx);
    ctx.lineTo(left + w, top + h - rx);
    ctx.quadraticCurveTo(left + w, top + h, left + w - rx, top + h);
    ctx.lineTo(left + rx, top + h);
    ctx.quadraticCurveTo(left, top + h, left, top + h - rx);
    ctx.lineTo(left, top + rx);
    ctx.quadraticCurveTo(left, top, left + rx, top);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = stamp.color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(stamp.label, x, y);

    ctx.restore();
  }

  private async buildCanvasFile(): Promise<File | null> {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return null;
    if (!this.canvasHasInk()) return null;
    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    const name = `marked-script-${this.responseId || 'response'}.png`;
    return new File([blob], name, { type: 'image/png' });
  }

  save(): void {
    if (!this.responseId) return;
    this.error = null;
    this.success = null;

    this.saving = true;
    (async () => {
      const form = new FormData();
      if (this.score !== null && this.score !== undefined && String(this.score).trim() !== '') {
        form.append('score', String(this.score));
      }
      if ((this.feedbackText || '').trim()) {
        form.append('feedbackText', this.feedbackText.trim());
      }

      // Prefer explicit uploaded feedback file; otherwise use the canvas drawing if present.
      if (this.feedbackFile) {
        form.append('file', this.feedbackFile);
      } else {
        const combinedFile = await this.buildMarkedPreviewFile();
        if (combinedFile) form.append('file', combinedFile);
      }

      this.elearningService.markResponse(this.responseId, form).subscribe({
        next: (saved: any) => {
          this.saving = false;
          this.success = 'Marked and sent back to the student.';
          this.response = saved;
        },
        error: (err: any) => {
          this.saving = false;
          this.error = err?.error?.message || 'Failed to save marking.';
        },
      });
    })().catch((e: any) => {
      this.saving = false;
      this.error = e?.message || 'Failed to prepare digital pen marking.';
    });
  }

  /**
   * Build a PNG of the student's script WITH all digital marks on top.
   * This is what the student will see as the "marked script" (feedback file).
   */
  private async buildMarkedPreviewFile(): Promise<File | null> {
    // Only generate if there is at least some ink on the overlay
    if (!this.canvasHasInk()) return null;

    const root = this.pageRootRef?.nativeElement;
    if (!root) return null;

    const canvas = await html2canvas(root, {
      backgroundColor: '#ffffff',
      useCORS: true,
      scale: window.devicePixelRatio || 1,
      logging: false,
    });

    const blob: Blob | null = await new Promise(resolve =>
      canvas.toBlob(resolve, 'image/png', 0.92)
    );
    if (!blob) return null;
    const name = `marked-script-${this.responseId || 'response'}.png`;
    return new File([blob], name, { type: 'image/png' });
  }

  private load(): void {
    this.loading = true;
    this.error = null;
    this.elearningService.getResponseById(this.responseId).subscribe({
      next: (r: any) => {
        this.loading = false;
        this.response = r || null;
        this.score = r?.score ?? null;
        this.feedbackText = r?.feedbackText || '';
        this.safeResponseText = r?.text
          ? this.sanitizer.bypassSecurityTrustHtml(String(r.text))
          : null;
        this.prepareStudentAttachmentPreview();
        // Ensure overlay matches newly rendered content height.
        setTimeout(() => this.resizeCanvasToPage(), 0);
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to load response.';
      },
    });
  }

  private prepareStudentAttachmentPreview(): void {
    const url = String(this.response?.fileUrl || '').trim();
    this.studentAttachmentUrl = url || null;
    this.studentAttachmentKind = null;
    this.pdfPageImages = [];
    this.pdfLoading = false;
    this.pdfError = null;
    if (!url) return;

    const lower = url.split('?')[0].toLowerCase();
    const isPdf = lower.endsWith('.pdf');
    const isImage = /\.(png|jpe?g|gif|webp)$/i.test(lower);
    if (isPdf) {
      this.studentAttachmentKind = 'pdf';
      // Render PDFs as page images so scroll/zoom stay in THIS page (marks stay aligned).
      this.renderPdfToImages(url);
      return;
    }
    if (isImage) {
      this.studentAttachmentKind = 'image';
      return;
    }
    this.studentAttachmentKind = 'other';
  }

  zoomIn(): void {
    this.setZoom(this.previewZoom + 0.1);
  }

  zoomOut(): void {
    this.setZoom(this.previewZoom - 0.1);
  }

  zoomReset(): void {
    this.setZoom(1);
  }

  private setZoom(z: number): void {
    const next = Math.min(2.2, Math.max(0.6, Math.round(z * 10) / 10));
    this.previewZoom = next;
    // keep overlay aligned after zoom/layout changes
    setTimeout(() => this.resizeCanvasToPage(), 0);
  }

  private async renderPdfToImages(url: string): Promise<void> {
    this.pdfLoading = true;
    this.pdfError = null;
    this.pdfPageImages = [];
    try {
      // Disable worker to avoid any external/dynamic worker loading failures.
      const loadingTask = (pdfjsLib as any).getDocument({
        url,
        withCredentials: true,
      });
      const pdf = await loadingTask.promise;
      const pageCount = Math.min(pdf.numPages || 0, 20); // safety cap

      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        this.pdfPageImages.push(canvas.toDataURL('image/png'));
      }
    } catch (e: any) {
      this.pdfError = e?.message || 'Failed to render PDF preview.';
    } finally {
      this.pdfLoading = false;
      setTimeout(() => this.resizeCanvasToPage(), 0);
    }
  }
}

