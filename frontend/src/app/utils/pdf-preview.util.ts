/** Append PDF viewer fragment so embedded previews fit the viewport width. */
export function pdfBlobViewerUrl(blobUrl: string): string {
  if (!blobUrl) {
    return blobUrl;
  }
  if (blobUrl.includes('#')) {
    return blobUrl;
  }
  return `${blobUrl}#view=FitH&zoom=page-width`;
}
