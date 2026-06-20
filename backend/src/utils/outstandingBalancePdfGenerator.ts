import {
  createOutstandingBalanceHTMLBuffer,
  OutstandingBalanceHTMLData,
} from './outstandingBalanceHtmlGenerator';

/** @deprecated Use OutstandingBalanceHTMLData */
export type OutstandingBalancePDFData = OutstandingBalanceHTMLData;

/** Returns a self-contained HTML statement (print to PDF via browser). */
export function createOutstandingBalancePDF(data: OutstandingBalancePDFData): Promise<Buffer> {
  return Promise.resolve(createOutstandingBalanceHTMLBuffer(data));
}

export {
  aggregateOutstandingByStudent,
  createOutstandingBalanceHTML,
  createOutstandingBalanceHTMLBuffer,
} from './outstandingBalanceHtmlGenerator';
