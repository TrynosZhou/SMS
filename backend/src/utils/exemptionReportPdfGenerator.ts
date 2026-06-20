import {
  createExemptionReportHTMLBuffer,
  ExemptionReportHTMLData,
} from './exemptionReportHtmlGenerator';

/** @deprecated Use ExemptionReportHTMLData */
export type ExemptionReportPDFData = ExemptionReportHTMLData;

/** Returns a self-contained HTML statement (print to PDF via browser). */
export function createExemptionReportPDF(data: ExemptionReportPDFData): Promise<Buffer> {
  return Promise.resolve(createExemptionReportHTMLBuffer(data));
}

export {
  createExemptionReportHTML,
  createExemptionReportHTMLBuffer,
} from './exemptionReportHtmlGenerator';
