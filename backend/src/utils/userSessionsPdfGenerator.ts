import PDFDocument from 'pdfkit';
import { Settings } from '../entities/Settings';
import { UserSessionLog } from '../entities/UserSessionLog';

export interface UserSessionsPdfMeta {
  filterSummary?: string;
  generatedAt?: Date;
}

type PdfDoc = InstanceType<typeof PDFDocument>;

const MARGIN = 40;
const HEADER_HEIGHT = 88;
const FOOTER_HEIGHT = 28;

const GRID_BLUE = '#b8d4f0';
const GRID_GREY = '#c5cdd8';
const HEADER_BG = '#f8fafc';
const ROW_ALT_BG = '#f5f9ff';

const COLUMNS: { key: string; label: string; width: number }[] = [
  { key: 'user', label: 'User', width: 68 },
  { key: 'role', label: 'Role', width: 52 },
  { key: 'status', label: 'Status', width: 48 },
  { key: 'login', label: 'Login', width: 82 },
  { key: 'last', label: 'Last activity', width: 82 },
  { key: 'logout', label: 'Logout', width: 82 },
  { key: 'duration', label: 'Duration', width: 48 },
  { key: 'modules', label: 'Modules', width: 130 },
  { key: 'ip', label: 'IP', width: 72 },
];

function decodeLogoBuffer(logo: string | null | undefined): Buffer | null {
  const raw = String(logo || '').trim();
  if (!raw.startsWith('data:image')) return null;
  try {
    const base64Data = raw.split(',')[1];
    if (!base64Data) return null;
    return Buffer.from(base64Data, 'base64');
  } catch {
    return null;
  }
}

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

function formatRole(role: string | null | undefined): string {
  if (!role) return '—';
  return String(role).replace(/_/g, ' ');
}

function cellValue(row: UserSessionLog, key: string): string {
  switch (key) {
    case 'user':
      return String(row.username || row.userId || '—');
    case 'role':
      return formatRole(row.role);
    case 'status':
      return row.logoutAt ? 'Logged out' : 'Active';
    case 'login':
      return formatDateTime(row.loginAt);
    case 'last':
      return formatDateTime(row.lastActivityAt);
    case 'logout':
      return formatDateTime(row.logoutAt);
    case 'duration':
      return formatDuration(row.timeSpentSeconds);
    case 'modules':
      return String(row.modules || '—');
    case 'ip':
      return String(row.ipAddress || '—');
    default:
      return '—';
  }
}

function tableWidth(): number {
  return COLUMNS.reduce((sum, col) => sum + col.width, 0);
}

function drawSchoolHeader(doc: PdfDoc, settings: Settings | null, pageWidth: number): number {
  const schoolName = settings?.schoolName?.trim() || 'School Management System';
  const logoBuffer =
    decodeLogoBuffer(settings?.schoolLogo) || decodeLogoBuffer(settings?.schoolLogo2);

  const topY = MARGIN;
  const logoW = 64;
  const logoH = 48;

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, MARGIN, topY, { fit: [logoW, logoH] });
    } catch (error) {
      console.warn('[UserSessionsPDF] Failed to render school logo:', error);
    }
  }

  doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f172a');
  doc.text(schoolName, MARGIN, topY + 12, {
    width: pageWidth - MARGIN * 2,
    align: 'center',
  });

  const address = settings?.schoolAddress?.trim();
  if (address) {
    doc.font('Helvetica').fontSize(9).fillColor('#475569');
    doc.text(address, MARGIN, topY + 34, {
      width: pageWidth - MARGIN * 2,
      align: 'center',
    });
  }

  const lineY = topY + HEADER_HEIGHT - 12;
  doc.save();
  doc.strokeColor(GRID_BLUE).lineWidth(1.5);
  doc.moveTo(MARGIN, lineY).lineTo(pageWidth - MARGIN, lineY).stroke();
  doc.restore();

  return lineY + 14;
}

function drawReportTitle(doc: PdfDoc, pageWidth: number, startY: number, meta: UserSessionsPdfMeta, rowCount: number): number {
  let y = startY;

  doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a');
  doc.text('User Activity Log Report', MARGIN, y, { width: pageWidth - MARGIN * 2, align: 'left' });
  y += 20;

  doc.font('Helvetica').fontSize(9).fillColor('#475569');
  const generated = (meta.generatedAt || new Date()).toLocaleString('en-GB');
  doc.text(`Generated: ${generated}`, MARGIN, y);
  y += 13;
  doc.text(`Total sessions: ${rowCount}`, MARGIN, y);
  y += 13;

  if (meta.filterSummary) {
    doc.text(`Filters: ${meta.filterSummary}`, MARGIN, y, {
      width: pageWidth - MARGIN * 2,
    });
    y += doc.heightOfString(meta.filterSummary, { width: pageWidth - MARGIN * 2 }) + 4;
  }

  return y + 8;
}

function measureRowHeight(doc: PdfDoc, row: UserSessionLog | null, isHeader: boolean): number {
  doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeader ? 8 : 7.5);
  let maxH = isHeader ? 22 : 18;
  for (const col of COLUMNS) {
    const text = isHeader ? col.label : cellValue(row as UserSessionLog, col.key);
    const h = doc.heightOfString(text, { width: col.width - 8 }) + 10;
    if (h > maxH) maxH = h;
  }
  return maxH;
}

function drawTableRow(
  doc: PdfDoc,
  y: number,
  row: UserSessionLog | null,
  options: { isHeader?: boolean; rowIndex?: number; pageWidth: number }
): number {
  const { isHeader = false, rowIndex = 0 } = options;
  const rowH = measureRowHeight(doc, row, isHeader);
  let x = MARGIN;
  const borderColor = isHeader ? GRID_BLUE : rowIndex % 2 === 0 ? GRID_BLUE : GRID_GREY;
  const fillColor = isHeader ? HEADER_BG : rowIndex % 2 === 1 ? ROW_ALT_BG : '#ffffff';

  for (const col of COLUMNS) {
    doc.save();
    doc.rect(x, y, col.width, rowH).fill(fillColor);
    doc.rect(x, y, col.width, rowH).strokeColor(borderColor).lineWidth(0.75).stroke();
    doc.restore();

    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(isHeader ? 8 : 7.5)
      .fillColor('#0f172a');

    const text = isHeader ? col.label : cellValue(row as UserSessionLog, col.key);
    doc.text(text, x + 4, y + 5, {
      width: col.width - 8,
      align: 'left',
      lineBreak: true,
    });

    x += col.width;
  }

  return y + rowH;
}

function drawPageFooter(doc: PdfDoc, pageWidth: number, pageHeight: number, pageNum: number): void {
  const y = pageHeight - MARGIN + 8;
  doc.font('Helvetica').fontSize(8).fillColor('#64748b');
  doc.text(`Page ${pageNum}`, MARGIN, y, {
    width: pageWidth - MARGIN * 2,
    align: 'center',
  });
}

export function buildUserSessionsFilterSummary(query: Record<string, any>): string {
  const parts: string[] = [];
  const { startDate, endDate, role, action, entityId, performedBy } = query;
  if (startDate) parts.push(`From ${startDate}`);
  if (endDate) parts.push(`To ${endDate}`);
  if (role && role !== 'all') parts.push(`Role: ${String(role).replace(/_/g, ' ')}`);
  if (action && action !== 'all') {
    parts.push(action === 'active' ? 'Status: Active' : 'Status: Logged out');
  }
  if (entityId?.trim()) parts.push(`User ID contains "${entityId.trim()}"`);
  if (performedBy?.trim()) parts.push(`Username contains "${performedBy.trim()}"`);
  return parts.length ? parts.join(' · ') : 'None (all sessions)';
}

export function createUserSessionsPDF(
  rows: UserSessionLog[],
  settings: Settings | null,
  meta: UserSessionsPdfMeta = {}
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: MARGIN,
        size: 'A4',
        layout: 'landscape',
        bufferPages: true,
      });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      let pageNum = 1;

      let y = drawSchoolHeader(doc, settings, pageWidth);
      y = drawReportTitle(doc, pageWidth, y, meta, rows.length);

      const bottomLimit = pageHeight - MARGIN - FOOTER_HEIGHT;
      const drawHeaderRow = () => {
        y = drawTableRow(doc, y, null, { isHeader: true, pageWidth });
      };

      drawHeaderRow();

      rows.forEach((row, index) => {
        const upcomingHeight = measureRowHeight(doc, row, false);
        if (y + upcomingHeight > bottomLimit) {
          drawPageFooter(doc, pageWidth, pageHeight, pageNum);
          doc.addPage({ layout: 'landscape', margin: MARGIN });
          pageNum += 1;
          y = drawSchoolHeader(doc, settings, pageWidth);
          y = drawReportTitle(doc, pageWidth, y, meta, rows.length);
          drawHeaderRow();
        }
        y = drawTableRow(doc, y, row, { rowIndex: index, pageWidth });
      });

      if (rows.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor('#64748b');
        doc.text('No session records match the selected filters.', MARGIN, y + 8, {
          width: tableWidth(),
          align: 'center',
        });
      }

      drawPageFooter(doc, pageWidth, pageHeight, pageNum);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
