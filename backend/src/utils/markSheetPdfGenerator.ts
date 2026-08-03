import { Settings } from '../entities/Settings';
import {
  createMarkSheetHTMLBuffer,
  MarkSheetHTMLData,
  MarkSheetHTMLOptions,
} from './markSheetHtmlGenerator';

/** @deprecated Use MarkSheetHTMLData */
export type MarkSheetPDFData = MarkSheetHTMLData;

export function createMarkSheetPDF(
  markSheetData: MarkSheetHTMLData,
  settings: Settings | null,
  options?: MarkSheetHTMLOptions
): Promise<Buffer> {
  return Promise.resolve(createMarkSheetHTMLBuffer(markSheetData, settings, options));
}

export {
  createMarkSheetHTML,
  createMarkSheetHTMLBuffer,
} from './markSheetHtmlGenerator';
