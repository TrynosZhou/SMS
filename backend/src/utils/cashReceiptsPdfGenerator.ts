import {
  CashReceiptsHTMLData,
  CashReceiptsHTMLRow,
  createCashReceiptsHTMLBuffer,
} from './cashReceiptsHtmlGenerator';

/** @deprecated Use CashReceiptsHTMLRow */
export type CashReceiptsPDFRow = CashReceiptsHTMLRow;

/** @deprecated Use CashReceiptsHTMLData */
export type CashReceiptsPDFData = CashReceiptsHTMLData & {
  totalCashReceived?: number;
};

/** Returns a self-contained HTML report (print to PDF via browser). */
export function createCashReceiptsPDF(data: CashReceiptsPDFData): Promise<Buffer> {
  return Promise.resolve(createCashReceiptsHTMLBuffer(data));
}

export { createCashReceiptsHTML, createCashReceiptsHTMLBuffer } from './cashReceiptsHtmlGenerator';
