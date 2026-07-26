import PDFDocument from 'pdfkit';
import { Settings } from '../entities/Settings';
import { Teacher } from '../entities/Teacher';
import { AppraisalCycle } from '../entities/AppraisalCycle';

type PdfDoc = InstanceType<typeof PDFDocument>;

function decodeLogo(logo: string | null | undefined): Buffer | null {
  const raw = String(logo || '').trim();
  if (!raw.startsWith('data:image')) return null;
  try {
    const b64 = raw.split(',')[1];
    return b64 ? Buffer.from(b64, 'base64') : null;
  } catch {
    return null;
  }
}

function drawHeader(doc: PdfDoc, settings: Settings | null, pageWidth: number): number {
  const schoolName = settings?.schoolName?.trim() || 'School Management System';
  const logo = decodeLogo(settings?.schoolLogo) || decodeLogo(settings?.schoolLogo2);
  const top = 40;
  if (logo) {
    try {
      doc.image(logo, 40, top, { fit: [56, 42] });
    } catch {
      /* ignore */
    }
  }
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#0f172a');
  doc.text(schoolName, 40, top + 8, { width: pageWidth - 80, align: 'center' });
  if (settings?.schoolAddress) {
    doc.font('Helvetica').fontSize(9).fillColor('#475569');
    doc.text(String(settings.schoolAddress), 40, top + 28, { width: pageWidth - 80, align: 'center' });
  }
  doc.moveTo(40, top + 58).lineTo(pageWidth - 40, top + 58).strokeColor('#b8d4f0').lineWidth(1.5).stroke();
  return top + 70;
}

export function createTeacherAppraisalPdf(opts: {
  teacher: Teacher | null;
  summary: any;
  settings: Settings | null;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', (c) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      let y = drawHeader(doc, opts.settings, pageWidth);

      const name = opts.teacher
        ? `${opts.teacher.firstName} ${opts.teacher.lastName}`.trim()
        : 'Teacher';
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a');
      doc.text('Teacher Performance Appraisal Report', 40, y);
      y += 22;
      doc.font('Helvetica').fontSize(10).fillColor('#334155');
      doc.text(`Teacher: ${name}${opts.teacher?.teacherId ? ` (${opts.teacher.teacherId})` : ''}`, 40, y);
      y += 14;
      doc.text(`Cycle: ${opts.summary?.cycle?.name || '—'}`, 40, y);
      y += 14;
      doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, 40, y);
      y += 22;

      doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a');
      doc.text(
        `Composite score: ${opts.summary?.compositeScore != null ? opts.summary.compositeScore : '—'}`,
        40,
        y
      );
      y += 20;

      doc.font('Helvetica-Bold').fontSize(11).text('Scores by source', 40, y);
      y += 16;
      const bySource = opts.summary?.bySource || {};
      for (const [source, score] of Object.entries(bySource)) {
        doc.font('Helvetica').fontSize(10).fillColor('#334155');
        doc.text(`${source}: ${score != null ? score : '—'}`, 50, y);
        y += 14;
      }
      y += 10;

      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('Submitted appraisals', 40, y);
      y += 16;
      const appraisals = opts.summary?.appraisals || [];
      for (const a of appraisals) {
        if (y > 720) {
          doc.addPage();
          y = drawHeader(doc, opts.settings, pageWidth);
        }
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a');
        doc.text(
          `${a.sourceType} · ${a.status} · overall ${a.overallScore != null ? a.overallScore : '—'}`,
          40,
          y
        );
        y += 14;
        if (a.comments) {
          doc.font('Helvetica').fontSize(9).fillColor('#475569');
          doc.text(String(a.comments), 50, y, { width: pageWidth - 100 });
          y += doc.heightOfString(String(a.comments), { width: pageWidth - 100 }) + 6;
        }
        for (const s of a.scores || []) {
          doc.font('Helvetica').fontSize(9).fillColor('#334155');
          doc.text(`• ${s.criterion?.name || 'Criterion'}: ${s.score}`, 55, y);
          y += 12;
        }
        y += 8;
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

export function createDepartmentAppraisalPdf(opts: {
  cycle: AppraisalCycle;
  rows: Array<{ teacher: Teacher; compositeScore: number | null; bySource: Record<string, number | null> }>;
  settings: Settings | null;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      const buffers: Buffer[] = [];
      doc.on('data', (c) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      let y = drawHeader(doc, opts.settings, pageWidth);

      doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a');
      doc.text('Teacher Appraisal — School Summary', 40, y);
      y += 18;
      doc.font('Helvetica').fontSize(10).fillColor('#334155');
      doc.text(`Cycle: ${opts.cycle.name}`, 40, y);
      y += 14;
      doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, 40, y);
      y += 20;

      const cols = [
        { label: 'Teacher', w: 140 },
        { label: 'Composite', w: 70 },
        { label: 'Self', w: 55 },
        { label: 'Supervisor', w: 70 },
        { label: 'Peer', w: 55 },
        { label: 'Student', w: 55 },
        { label: 'Parent', w: 55 },
      ];

      const drawRow = (cells: string[], header = false) => {
        let x = 40;
        const h = 20;
        for (let i = 0; i < cols.length; i++) {
          doc.save();
          doc.rect(x, y, cols[i].w, h).fill(header ? '#f8fafc' : i % 2 ? '#f5f9ff' : '#fff');
          doc.rect(x, y, cols[i].w, h).strokeColor('#c5cdd8').lineWidth(0.6).stroke();
          doc.restore();
          doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor('#0f172a');
          doc.text(cells[i] || '—', x + 4, y + 6, { width: cols[i].w - 8 });
          x += cols[i].w;
        }
        y += h;
      };

      drawRow(cols.map((c) => c.label), true);
      for (const row of opts.rows) {
        if (y > doc.page.height - 60) {
          doc.addPage({ layout: 'landscape', margin: 40 });
          y = drawHeader(doc, opts.settings, pageWidth);
          drawRow(cols.map((c) => c.label), true);
        }
        const name = `${row.teacher.firstName} ${row.teacher.lastName}`.trim();
        drawRow([
          name,
          row.compositeScore != null ? String(row.compositeScore) : '—',
          row.bySource.self != null ? String(row.bySource.self) : '—',
          row.bySource.supervisor != null ? String(row.bySource.supervisor) : '—',
          row.bySource.peer != null ? String(row.bySource.peer) : '—',
          row.bySource.student != null ? String(row.bySource.student) : '—',
          row.bySource.parent != null ? String(row.bySource.parent) : '—',
        ]);
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
