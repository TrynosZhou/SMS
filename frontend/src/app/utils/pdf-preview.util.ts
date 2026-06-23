/** Default zoom for embedded PDF previews on desktop (Chrome/Edge PDF viewer). */
export const PDF_PREVIEW_DESKTOP_ZOOM = 120;

/** Default zoom for report card PDF previews (readable without manual zoom-in). */
export const PDF_REPORT_CARD_PREVIEW_ZOOM = 113;

/** Viewport width at or below which mobile PDF settings apply. */
export const PDF_PREVIEW_MOBILE_MAX_WIDTH_PX = 768;

function isMobilePdfViewport(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia(`(max-width: ${PDF_PREVIEW_MOBILE_MAX_WIDTH_PX}px)`).matches;
}

/** PDF fragment for the browser's built-in viewer (zoom / fit). */
export function pdfViewerFragment(): string {
  if (isMobilePdfViewport()) {
    // Fit page width — best readability on narrow screens without horizontal scroll.
    return 'view=FitH&zoom=page-width';
  }
  return `zoom=${PDF_PREVIEW_DESKTOP_ZOOM}`;
}

/** Append PDF viewer fragment so embedded previews use the correct zoom. */
export function pdfBlobViewerUrl(blobUrl: string): string {
  if (!blobUrl) {
    return blobUrl;
  }
  if (blobUrl.includes('#')) {
    return blobUrl;
  }
  return `${blobUrl}#${pdfViewerFragment()}`;
}

/** Report card previews — fixed zoom so students don't start at a tiny fit-to-page scale. */
export function pdfReportCardViewerFragment(): string {
  if (isMobilePdfViewport()) {
    return 'view=FitH&zoom=page-width&toolbar=1&navpanes=0';
  }
  return `zoom=${PDF_REPORT_CARD_PREVIEW_ZOOM}&toolbar=1&navpanes=0`;
}

/** A4 landscape report cards — readable default zoom in embedded/fullscreen viewers. */
export function pdfReportCardViewerUrl(blobUrl: string): string {
  if (!blobUrl) {
    return blobUrl;
  }
  if (blobUrl.includes('#')) {
    return blobUrl;
  }
  return `${blobUrl}#${pdfReportCardViewerFragment()}`;
}
