import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { isMobilePdfViewport } from '../utils/pdf-preview.util';

@Injectable({ providedIn: 'root' })
export class PdfJsRenderService {
  private workerReady = false;

  private ensureWorker(): void {
    if (this.workerReady) {
      return;
    }
    (GlobalWorkerOptions as any).workerSrc = 'assets/pdf.worker.min.mjs';
    this.workerReady = true;
  }

  /** Render a PDF blob to PNG data URLs — reliable on mobile where iframe blob previews fail. */
  async renderBlobToPageImages(blob: Blob, maxPages = 12): Promise<string[]> {
    if (!blob || blob.size === 0) {
      throw new Error('Empty PDF file.');
    }

    this.ensureWorker();
    const url = URL.createObjectURL(blob);

    try {
      const loadingTask = (pdfjsLib as any).getDocument({ url, verbosity: 0 });
      const pdf = await loadingTask.promise;
      const pageCount = Math.min(Number(pdf.numPages) || 0, maxPages);
      if (pageCount <= 0) {
        throw new Error('PDF has no pages.');
      }

      const scale = isMobilePdfViewport() ? 2.2 : 1.6;
      const images: string[] = [];

      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          continue;
        }
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        images.push(canvas.toDataURL('image/png'));
      }

      if (!images.length) {
        throw new Error('Could not render PDF pages.');
      }

      return images;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async renderBlobUrlToPageImages(blobUrl: string, maxPages = 12): Promise<string[]> {
    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error('Failed to load PDF for preview.');
    }
    const blob = await response.blob();
    return this.renderBlobToPageImages(blob, maxPages);
  }
}
