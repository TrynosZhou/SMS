import { Settings } from '../entities/Settings';
import {
  createMarkSheetHTMLBuffer,
  MarkSheetHTMLData,
} from './markSheetHtmlGenerator';

/** @deprecated Use MarkSheetHTMLData */
export type MarkSheetPDFData = MarkSheetHTMLData;

export function createMarkSheetPDF(
  markSheetData: MarkSheetHTMLData,
  settings: Settings | null
): Promise<Buffer> {
  return Promise.resolve(createMarkSheetHTMLBuffer(markSheetData, settings));
}

export {
  createMarkSheetHTML,
  createMarkSheetHTMLBuffer,
} from './markSheetHtmlGenerator';
