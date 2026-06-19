import PDFDocument from 'pdfkit';
import { Settings } from '../entities/Settings';
import { CREST_LEDGER as T } from './invoicePdfTheme';

type Doc = InstanceType<typeof PDFDocument>;

export function decodeCrestLogoBuffer(settings: Settings | null): Buffer | null {
  const raw = String(settings?.schoolLogo ?? '').trim();
  if (!raw.startsWith('data:image')) {
    return null;
  }
  const base64Data = raw.split(',')[1];
  if (!base64Data) {
    return null;
  }
  try {
    return Buffer.from(base64Data, 'base64');
  } catch {
    return null;
  }
}

export interface CrestLetterheadOptions {
  tableStartX: number;
  tableEndX: number;
  yStart: number;
  documentSubtitle: string;
  documentTitle: string;
}

/** Crest Ledger letterhead + navy/gold divider. Returns Y after divider. */
export function drawCrestLetterhead(
  doc: Doc,
  settings: Settings | null,
  opts: CrestLetterheadOptions
): number {
  const { tableStartX, tableEndX, yStart, documentSubtitle, documentTitle } = opts;
  let yPos = yStart;

  const logoBuffer = decodeCrestLogoBuffer(settings);
  const badgeRadius = 28;
  const badgeCx = tableStartX + badgeRadius;
  const badgeCy = yPos + badgeRadius;
  const logoInner = 40;

  doc.circle(badgeCx, badgeCy, badgeRadius).fill(T.navy);
  if (logoBuffer) {
    try {
      doc.save();
      doc.circle(badgeCx, badgeCy, badgeRadius - 2).clip();
      doc.image(logoBuffer, badgeCx - logoInner / 2, badgeCy - logoInner / 2, {
        width: logoInner,
        height: logoInner
      });
      doc.restore();
    } catch (error) {
      console.error('Could not add school logo to PDF:', error);
    }
  }
  doc.circle(badgeCx, badgeCy, badgeRadius).lineWidth(1.25).strokeColor(T.gold).stroke();

  const schoolName = settings?.schoolName || 'School Management System';
  const schoolAddress = settings?.schoolAddress ? String(settings.schoolAddress).trim() : '';
  const schoolPhone = settings?.schoolPhone || '';
  const schoolEmail = settings?.schoolEmail || '';
  const nameX = tableStartX + badgeRadius * 2 + 12;

  doc.fontSize(13).font(T.serifBold).fillColor(T.navy);
  doc.text(schoolName, nameX, yPos + 4, { width: tableEndX - nameX - 120 });

  const contactParts = [
    schoolAddress,
    schoolPhone ? `Tel: ${schoolPhone}` : '',
    schoolEmail ? `Email: ${schoolEmail}` : ''
  ].filter(Boolean);
  if (contactParts.length) {
    doc.fontSize(7).font(T.sans).fillColor(T.slateMuted);
    doc.text(contactParts.join('  ·  '), nameX, yPos + 20, { width: tableEndX - nameX - 120 });
  }

  const titleBlockW = 115;
  const titleX = tableEndX - titleBlockW;
  doc.fontSize(6.5).font(T.sansBold).fillColor(T.slateMuted);
  doc.text(documentSubtitle, titleX, yPos + 6, { width: titleBlockW, align: 'right' });
  doc.fontSize(22).font(T.serifBold).fillColor(T.navy);
  doc.text(documentTitle, titleX, yPos + 16, { width: titleBlockW, align: 'right' });

  yPos += badgeRadius * 2 + 8;

  doc.strokeColor(T.navy).lineWidth(2.5);
  doc.moveTo(tableStartX, yPos).lineTo(tableEndX, yPos).stroke();
  doc.strokeColor(T.gold).lineWidth(0.75);
  doc.moveTo(tableStartX, yPos + 3).lineTo(tableEndX, yPos + 3).stroke();

  return yPos + 14;
}

export interface CrestMetaRow {
  label: string;
  value: string;
}

export interface CrestMetaBlockOptions {
  tableStartX: number;
  tableWidth: number;
  tableEndX: number;
  yStart: number;
  leftTitle: string;
  rightTitle: string;
  leftRows: CrestMetaRow[];
  rightRows: CrestMetaRow[];
}

/** Two-column meta panel (Invoice Details / Billed To style). Returns Y after box. */
export function drawCrestMetaBlock(doc: Doc, opts: CrestMetaBlockOptions): number {
  const { tableStartX, tableWidth, tableEndX, yStart, leftTitle, rightTitle, leftRows, rightRows } = opts;

  const metaPadX = 14;
  const metaPadTop = 10;
  const metaPadBottom = 10;
  const sectionHeaderH = 16;
  const detailRowStep = 15;
  const rowCount = Math.max(leftRows.length, rightRows.length);
  const detailsBoxHeight = metaPadTop + sectionHeaderH + 6 + rowCount * detailRowStep + metaPadBottom;

  doc.rect(tableStartX, yStart, tableWidth, detailsBoxHeight).fill(T.navyTint);
  doc.rect(tableStartX, yStart, tableWidth, detailsBoxHeight).lineWidth(0.5).strokeColor(T.navy).stroke();

  const dividerX = tableStartX + tableWidth * 0.5;
  doc.strokeColor(T.navy).lineWidth(0.35).opacity(0.25);
  doc.moveTo(dividerX, yStart + metaPadTop).lineTo(dividerX, yStart + detailsBoxHeight - metaPadBottom).stroke();
  doc.opacity(1);

  const leftX = tableStartX + metaPadX;
  const rightX = dividerX + metaPadX;
  const sectionLabelY = yStart + metaPadTop;

  const drawSectionLabel = (label: string, x: number) => {
    doc.fontSize(6.5).font(T.sansBold).fillColor(T.slateMuted);
    doc.text(label, x, sectionLabelY);
    doc.strokeColor(T.gold).lineWidth(0.8);
    doc.moveTo(x, sectionLabelY + 10).lineTo(x + 78, sectionLabelY + 10).stroke();
  };

  drawSectionLabel(leftTitle, leftX);
  drawSectionLabel(rightTitle, rightX);

  const drawDetailPair = (label: string, value: string, x: number, y: number, colW: number) => {
    doc.fontSize(8).font(T.sans).fillColor(T.slateMuted);
    doc.text(label, x, y + 1, { width: colW * 0.52, lineBreak: false });
    doc.fontSize(8.5).font(T.sansBold).fillColor(T.navy);
    doc.text(value, x, y, { width: colW, align: 'right', lineBreak: false });
  };

  const leftColW = dividerX - leftX - metaPadX;
  const rightColW = tableEndX - rightX - metaPadX;
  const detailStartY = yStart + metaPadTop + sectionHeaderH + 6;

  for (let i = 0; i < rowCount; i++) {
    const y = detailStartY + i * detailRowStep;
    if (leftRows[i]) {
      drawDetailPair(leftRows[i].label, leftRows[i].value, leftX, y, leftColW);
    }
    if (rightRows[i]) {
      drawDetailPair(rightRows[i].label, rightRows[i].value, rightX, y, rightColW);
    }
  }

  return yStart + detailsBoxHeight + 10;
}

export function formatCrestMoney(currencySymbol: string, amount: number): string {
  return `${currencySymbol} ${amount.toFixed(2)}`.trim();
}
