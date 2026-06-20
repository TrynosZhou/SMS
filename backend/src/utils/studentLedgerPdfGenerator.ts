import { createStudentLedgerHTMLBuffer, StudentLedgerHTMLData } from './studentLedgerHtmlGenerator';

/** @deprecated Use StudentLedgerHTMLData */
export type StudentLedgerPDFData = StudentLedgerHTMLData;

/** Returns a self-contained HTML statement (print to PDF via browser). */
export function createStudentLedgerPDF(data: StudentLedgerPDFData): Promise<Buffer> {
  return Promise.resolve(createStudentLedgerHTMLBuffer(data));
}

export { createStudentLedgerHTML, createStudentLedgerHTMLBuffer } from './studentLedgerHtmlGenerator';
