import {
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PdfJsRenderService } from '../../../services/pdf-js-render.service';
import {
  isMobilePdfViewport,
  pdfBlobViewerUrl,
  pdfReportCardViewerUrl,
} from '../../../utils/pdf-preview.util';

@Component({
  standalone: false,
  selector: 'app-pdf-blob-viewer',
  templateUrl: './pdf-blob-viewer.component.html',
  styleUrls: ['./pdf-blob-viewer.component.css'],
})
export class PdfBlobViewerComponent implements OnChanges, OnDestroy {
  /** Raw blob URL from URL.createObjectURL — required for preview. */
  @Input() blobUrl: string | null = null;
  @Input() loadingExternal = false;
  @Input() reportCardMode = false;
  @Input() title = 'PDF preview';

  useJsRenderer = false;
  safeIframeUrl: SafeResourceUrl | null = null;
  pageImages: string[] = [];
  rendering = false;
  renderError = '';

  private renderGeneration = 0;

  constructor(
    private sanitizer: DomSanitizer,
    private pdfJsRender: PdfJsRenderService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['blobUrl']) {
      void this.loadPreview();
    }
  }

  ngOnDestroy(): void {
    this.renderGeneration++;
  }

  get showLoading(): boolean {
    return this.loadingExternal || this.rendering;
  }

  get showError(): boolean {
    return !!this.renderError && !this.showLoading;
  }

  get showContent(): boolean {
    return !this.showLoading && !this.showError && (!!this.safeIframeUrl || this.pageImages.length > 0);
  }

  openInBrowser(): void {
    if (!this.blobUrl) {
      return;
    }
    window.open(this.blobUrl, '_blank', 'noopener,noreferrer');
  }

  private async loadPreview(): Promise<void> {
    const gen = ++this.renderGeneration;
    this.renderError = '';
    this.pageImages = [];
    this.safeIframeUrl = null;
    this.useJsRenderer = isMobilePdfViewport();

    if (!this.blobUrl) {
      this.cdr.markForCheck();
      return;
    }

    if (this.useJsRenderer) {
      this.rendering = true;
      this.cdr.markForCheck();
      try {
        const images = await this.pdfJsRender.renderBlobUrlToPageImages(this.blobUrl);
        if (gen !== this.renderGeneration) {
          return;
        }
        this.pageImages = images;
      } catch (err: any) {
        if (gen !== this.renderGeneration) {
          return;
        }
        this.renderError = err?.message || 'Could not render PDF preview on this device.';
      } finally {
        if (gen === this.renderGeneration) {
          this.rendering = false;
          this.cdr.markForCheck();
        }
      }
      return;
    }

    const viewerUrl = this.reportCardMode
      ? pdfReportCardViewerUrl(this.blobUrl)
      : pdfBlobViewerUrl(this.blobUrl);
    this.safeIframeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(viewerUrl);
    this.cdr.markForCheck();
  }
}
