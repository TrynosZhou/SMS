import { Component, OnInit, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { InventoryService } from '../../../services/inventory.service';
import { AuthService } from '../../../services/auth.service';
import { SettingsService } from '../../../services/settings.service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-teacher-inventory-record',
  templateUrl: './teacher-inventory-record.component.html',
  styleUrls: ['./teacher-inventory-record.component.css']
})
export class TeacherInventoryRecordComponent implements OnInit, OnDestroy {
  mode: 'textbooks' | 'furniture' | 'reports' = 'textbooks';

  textbookAllocations: any[] = [];
  furnitureAllocations: any[] = [];
  classStudents: any[] = [];

  loadingTB = false;
  loadingFN = false;
  loadingStudents = false;
  errorTB = '';
  errorFN = '';

  /** Issue textbook form state */
  issueTextbookForm: {
    allocationId: string;
    specificCopyNumber: string;   // the J-number to issue (empty = auto next available)
    studentId: string;
    issuanceType: 'permanent' | 'loan';
    loanDueAt: string;
    notes: string;
  } | null = null;
  issuingTextbook = false;
  issueTextbookError = '';
  issueTextbookSuccess = '';

  /** Issue furniture form state */
  issueFurnitureForm: {
    allocationId: string;
    itemCode: string;
    studentId: string;
    notes: string;
  } | null = null;
  issuingFurniture = false;
  issueFurnitureError = '';
  issueFurnitureSuccess = '';

  returningMap: Record<string, boolean> = {};

  /** Student picker state (replaces broken native <select><optgroup>) */
  studentPickerSearch = '';
  studentPickerOpen = false;

  /** Reports */
  reportTextbooks: any[] = [];
  reportFurniture: any[] = [];
  reportClassNames: string[] = [];
  loadingReport = false;
  reportError = '';
  reportPreviewMode: 'textbooks' | 'furniture' = 'textbooks';

  /** PDF preview */
  pdfPreviewUrl: SafeResourceUrl | null = null;
  pdfPreviewSection = '';
  private _blobUrl: string | null = null;

  schoolName = '';
  schoolLogo2: string | null = null;

  constructor(
    private inventory: InventoryService,
    public auth: AuthService,
    private sanitizer: DomSanitizer,
    private settingsService: SettingsService
  ) {}

  ngOnInit() {
    this.loadData();
    this.loadStudents();
    this.settingsService.getSettings().subscribe({
      next: (s: any) => {
        if (s) {
          this.schoolName = s.schoolName || '';
          this.schoolLogo2 = s.schoolLogo2 || null;
        }
      }
    });
  }

  ngOnDestroy() {
    this._revokeBlobUrl();
  }

  private _revokeBlobUrl() {
    if (this._blobUrl) {
      URL.revokeObjectURL(this._blobUrl);
      this._blobUrl = null;
    }
  }

  closePdfPreview() {
    this._revokeBlobUrl();
    this.pdfPreviewUrl = null;
    this.pdfPreviewSection = '';
  }

  loadData() {
    this.loadTextbookAllocations();
    this.loadFurnitureAllocations();
  }

  setMode(m: 'textbooks' | 'furniture' | 'reports') {
    this.mode = m;
    if (m === 'reports' && !this.reportTextbooks.length && !this.loadingReport) {
      this.loadReport();
    }
  }

  loadTextbookAllocations() {
    this.loadingTB = true;
    this.errorTB = '';
    this.inventory.listTeacherTextbookAllocations().subscribe({
      next: list => { this.textbookAllocations = list; this.loadingTB = false; },
      error: e => { this.errorTB = e.error?.message || 'Failed to load textbook allocations'; this.loadingTB = false; }
    });
  }

  loadFurnitureAllocations() {
    this.loadingFN = true;
    this.errorFN = '';
    this.inventory.listTeacherFurnitureAllocations().subscribe({
      next: list => { this.furnitureAllocations = list; this.loadingFN = false; },
      error: e => { this.errorFN = e.error?.message || 'Failed to load furniture allocations'; this.loadingFN = false; }
    });
  }

  loadStudents() {
    this.loadingStudents = true;
    this.inventory.getTeacherClassStudents().subscribe({
      next: students => {
        this.classStudents = students;
        this.loadingStudents = false;
      },
      error: () => { this.loadingStudents = false; }
    });
  }

  /** Unique class names visible to this teacher (for display in the modal header) */
  get myClassNames(): string {
    const names = [...new Set(this.classStudents.map(s => s.classEntity?.name).filter(Boolean))];
    return names.join(', ') || '—';
  }

  openIssueTextbookForm(alloc: any, specificCopyNumber: string = '') {
    this.issueTextbookError = '';
    this.issueTextbookSuccess = '';
    this.studentPickerSearch = '';
    this.studentPickerOpen = false;
    this.issueTextbookForm = {
      allocationId: alloc.id,
      specificCopyNumber,
      studentId: '',
      issuanceType: 'permanent',
      loanDueAt: '',
      notes: ''
    };
  }

  closeIssueTextbookForm() {
    this.issueTextbookForm = null;
    this.issueTextbookError = '';
    this.issueTextbookSuccess = '';
  }

  submitIssueTextbook() {
    if (!this.issueTextbookForm) return;
    if (!this.issueTextbookForm.studentId) {
      this.issueTextbookError = 'Please select a student'; return;
    }
    this.issuingTextbook = true;
    this.issueTextbookError = '';
    const f = this.issueTextbookForm;
    this.inventory.issueTextbookFromTeacherAllocation(
      f.allocationId, f.studentId, f.issuanceType,
      f.issuanceType === 'loan' && f.loanDueAt ? f.loanDueAt : undefined,
      f.notes || undefined,
      f.specificCopyNumber || undefined
    ).subscribe({
      next: (res: any) => {
        this.issuingTextbook = false;
        const cn = res?.copyNumber ? ` (Copy: ${res.copyNumber})` : '';
        this.issueTextbookSuccess = `Textbook issued successfully!${cn}`;
        this.issueTextbookForm = null;
        this.loadTextbookAllocations();
      },
      error: e => {
        this.issuingTextbook = false;
        this.issueTextbookError = e.error?.message || 'Issue failed';
      }
    });
  }

  openIssueFurnitureForm(alloc: any) {
    this.issueFurnitureError = '';
    this.issueFurnitureSuccess = '';
    this.studentPickerSearch = '';
    this.studentPickerOpen = false;
    this.issueFurnitureForm = {
      allocationId: alloc.id,
      itemCode: alloc.furnitureItem?.itemCode || '',
      studentId: '',
      notes: ''
    };
  }

  closeIssueFurnitureForm() {
    this.issueFurnitureForm = null;
    this.issueFurnitureError = '';
    this.issueFurnitureSuccess = '';
  }

  submitIssueFurniture() {
    if (!this.issueFurnitureForm) return;
    if (!this.issueFurnitureForm.studentId) {
      this.issueFurnitureError = 'Please select a student'; return;
    }
    this.issuingFurniture = true;
    this.issueFurnitureError = '';
    const f = this.issueFurnitureForm;
    this.inventory.issueFurnitureFromTeacherAllocation(f.allocationId, f.studentId, f.notes || undefined).subscribe({
      next: () => {
        this.issuingFurniture = false;
        this.issueFurnitureSuccess = `Furniture item ${f.itemCode} issued successfully!`;
        this.issueFurnitureForm = null;
        this.loadFurnitureAllocations();
      },
      error: e => {
        this.issuingFurniture = false;
        this.issueFurnitureError = e.error?.message || 'Issue failed';
      }
    });
  }

  returnTextbookAllocation(alloc: any) {
    if (!confirm(`Return ${alloc.quantityAllocated - alloc.quantityDistributed} unused copies of "${alloc.catalog?.title}" to admin stock?`)) return;
    this.returningMap[alloc.id] = true;
    this.inventory.returnTeacherTextbookAllocation(alloc.id).subscribe({
      next: () => { this.returningMap[alloc.id] = false; this.loadTextbookAllocations(); },
      error: e => { this.returningMap[alloc.id] = false; alert(e.error?.message || 'Return failed'); }
    });
  }

  returnFurnitureAllocation(alloc: any) {
    if (!confirm(`Return "${alloc.furnitureItem?.itemCode}" (${alloc.furnitureItem?.itemType}) to admin stock?`)) return;
    this.returningMap[alloc.id] = true;
    this.inventory.returnTeacherFurnitureAllocation(alloc.id).subscribe({
      next: () => { this.returningMap[alloc.id] = false; this.loadFurnitureAllocations(); },
      error: e => { this.returningMap[alloc.id] = false; alert(e.error?.message || 'Return failed'); }
    });
  }

  remaining(alloc: any): number {
    const total = alloc.quantity || alloc.quantityAllocated || 0;
    const distributed = alloc.quantityDistributed || 0;
    return total - distributed;
  }

  get activeTextbooks(): any[] {
    return this.textbookAllocations.filter(a => a.status === 'active');
  }

  get pastTextbooks(): any[] {
    return this.textbookAllocations.filter(a => a.status !== 'active');
  }

  get activeFurniture(): any[] {
    return this.furnitureAllocations.filter(a => a.status === 'active');
  }

  get pastFurniture(): any[] {
    return this.furnitureAllocations.filter(a => a.status !== 'active');
  }

  /** Flat filtered list for the custom student picker */
  get filteredStudents(): any[] {
    const q = this.studentPickerSearch.trim().toLowerCase();
    if (!q) return this.classStudents;
    return this.classStudents.filter(s =>
      this.studentName(s).toLowerCase().includes(q) ||
      (s.studentNumber || '').toLowerCase().includes(q)
    );
  }

  selectStudent(studentId: string, form: 'textbook' | 'furniture') {
    if (form === 'textbook' && this.issueTextbookForm) {
      this.issueTextbookForm.studentId = studentId;
    }
    if (form === 'furniture' && this.issueFurnitureForm) {
      this.issueFurnitureForm.studentId = studentId;
    }
    this.studentPickerOpen = false;
    this.studentPickerSearch = '';
  }

  selectedStudentName(studentId: string): string {
    if (!studentId) return '';
    const s = this.classStudents.find(st => st.id === studentId);
    return s ? this.studentName(s) : '';
  }

  groupStudentsByClass(): Array<{ className: string; students: any[] }> {
    const map = new Map<string, any[]>();
    for (const s of this.classStudents) {
      const cn = s.classEntity?.name || 'Unassigned';
      if (!map.has(cn)) map.set(cn, []);
      map.get(cn)!.push(s);
    }
    return Array.from(map.entries()).map(([className, students]) => ({ className, students }));
  }

  studentName(s: any): string {
    return `${s.firstName || ''} ${s.lastName || ''}`.trim() + (s.studentNumber ? ` (${s.studentNumber})` : '');
  }

  /**
   * Returns the next J-number that will be auto-assigned when a textbook is
   * issued from this allocation (first copyNumber not yet used).
   */
  nextAvailableCopyNumber(allocationId: string): string {
    const alloc = this.textbookAllocations.find(a => a.id === allocationId);
    if (!alloc || !alloc.copyNumbers?.length) return '—';
    const used = alloc.quantityDistributed || 0;
    const next = alloc.copyNumbers[used];
    return next || '—';
  }

  /** Returns all copy numbers for an allocation that have not yet been issued */
  availableCopyNumbers(alloc: any): string[] {
    if (!alloc?.copyNumbers?.length) return [];
    const distributed = alloc.quantityDistributed || 0;
    return alloc.copyNumbers.slice(distributed);
  }

  /** Returns all copy numbers for an allocation that have already been issued */
  issuedCopyNumbers(alloc: any): string[] {
    if (!alloc?.copyNumbers?.length) return [];
    const distributed = alloc.quantityDistributed || 0;
    return alloc.copyNumbers.slice(0, distributed);
  }

  isCopyAvailable(alloc: any, cn: string): boolean {
    return this.availableCopyNumbers(alloc).includes(cn);
  }

  /* ---- Report helpers ---- */

  loadReport() {
    this.loadingReport = true;
    this.reportError = '';
    this.inventory.getTeacherClassReport().subscribe({
      next: (data: any) => {
        this.reportTextbooks = data.textbooks || [];
        this.reportFurniture = data.furniture || [];
        this.reportClassNames = data.classNames || [];
        this.loadingReport = false;
      },
      error: e => {
        this.reportError = e.error?.message || 'Failed to load report';
        this.loadingReport = false;
      }
    });
  }

  get reportTitle(): string {
    const cls = this.reportClassNames.join(', ') || 'My Class';
    return `Inventory Report — ${cls}`;
  }

  /** Check if a student already has an active issuance of the given furniture type */
  studentHasFurnitureType(studentId: string, type: 'desk' | 'chair'): boolean {
    return this.reportFurniture.some(
      f => f.student?.id === studentId && f.furnitureItem?.itemType === type && f.status === 'active'
    );
  }

  /** Determine which furniture types are still available to issue to a student */
  furnitureWarning(studentId: string): string {
    const hasDesk = this.reportFurniture.some(
      f => f.studentId === studentId && f.furnitureItem?.itemType === 'desk' && f.status === 'active'
    );
    const hasChair = this.reportFurniture.some(
      f => f.studentId === studentId && f.furnitureItem?.itemType === 'chair' && f.status === 'active'
    );
    if (hasDesk && hasChair) return 'already has desk & chair';
    if (hasDesk) return 'already has desk';
    if (hasChair) return 'already has chair';
    return '';
  }

  private buildPDF(section: 'textbooks' | 'furniture' | 'both'): jsPDF {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const dateStr = new Date().toLocaleString();
    const classLabel = this.reportClassNames.join(', ') || 'My Class';
    const school = this.schoolName || 'School Management System';

    const LOGO_W = 22;   // mm — logo display width in the header
    const LOGO_H = 16;   // mm — logo display height (aspect maintained by jsPDF if equal to image AR)
    const HEADER_H = 24; // mm — total coloured banner height

    const drawPageHeader = (titleLine2: string) => {
      // Coloured background banner
      doc.setFillColor(30, 58, 95);
      doc.rect(0, 0, pageW, HEADER_H, 'F');

      // School logo 2 at top-left inside the banner
      if (this.schoolLogo2) {
        try {
          const logoX = 5;
          const logoY = (HEADER_H - LOGO_H) / 2;
          // Determine image format from data URI prefix
          let fmt: string = 'PNG';
          const m = this.schoolLogo2.match(/^data:image\/(\w+);base64,/);
          if (m) { fmt = m[1].toUpperCase(); }
          doc.addImage(this.schoolLogo2, fmt, logoX, logoY, LOGO_W, LOGO_H);
        } catch (_) { /* logo failed – skip silently */ }
      }

      // School name and sub-title (offset right of logo)
      const textX = this.schoolLogo2 ? 5 + LOGO_W + 4 : pageW / 2;
      const textAlign = this.schoolLogo2 ? 'left' : 'center';
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(school, textX, 9, { align: textAlign });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(titleLine2, textX, 17, { align: textAlign });

      // Sub-header info line
      doc.setTextColor(120);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Class: ${classLabel}`, 14, HEADER_H + 6);
      doc.text(`Generated: ${dateStr}`, pageW - 14, HEADER_H + 6, { align: 'right' });
      doc.setDrawColor(200);
      doc.line(14, HEADER_H + 8, pageW - 14, HEADER_H + 8);
    };

    if (section === 'textbooks' || section === 'both') {
      drawPageHeader('Textbook Issuance Report');

      const totalTB = this.reportTextbooks.length;
      const activeTB = this.reportTextbooks.filter(r => r.status === 'active').length;
      doc.setFontSize(9);
      doc.setTextColor(50);
      doc.setFont('helvetica', 'bold');
      doc.text(`Total issued: ${totalTB}   Active: ${activeTB}   Returned: ${totalTB - activeTB}`, 14, HEADER_H + 14);
      doc.setFont('helvetica', 'normal');

      autoTable(doc, {
        startY: HEADER_H + 18,
        head: [['#', 'Student Name', 'Student No.', 'Class', 'Book Title', 'J-Number', 'Type', 'Status', 'Date Issued']],
        body: this.reportTextbooks.length
          ? this.reportTextbooks.map((r, i) => [
              i + 1,
              `${r.student?.firstName || ''} ${r.student?.lastName || ''}`.trim() || '—',
              r.student?.studentNumber || '—',
              r.student?.classEntity?.name || classLabel,
              r.catalog?.title || '—',
              r.copyNumber || '—',
              (r.issuanceType || '—').toUpperCase(),
              (r.status || '—').toUpperCase(),
              r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'
            ])
          : [['', 'No textbook records found.', '', '', '', '', '', '', '']],
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [30, 58, 95], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [240, 245, 255] },
        columnStyles: { 5: { fontStyle: 'bold', textColor: [30, 58, 95] } },
        margin: { left: 14, right: 14 }
      });
    }

    if (section === 'furniture' || section === 'both') {
      if (section === 'both') {
        doc.addPage();
      }
      drawPageHeader('Furniture Issuance Report');

      const totalFN = this.reportFurniture.length;
      const desks = this.reportFurniture.filter(r => r.furnitureItem?.itemType === 'desk').length;
      const chairs = this.reportFurniture.filter(r => r.furnitureItem?.itemType === 'chair').length;
      const activeFN = this.reportFurniture.filter(r => r.status === 'active').length;

      doc.setFontSize(9);
      doc.setTextColor(50);
      doc.setFont('helvetica', 'bold');
      doc.text(
        `Total issued: ${totalFN}   Desks: ${desks}   Chairs: ${chairs}   Active: ${activeFN}   Returned: ${totalFN - activeFN}`,
        14, HEADER_H + 14
      );
      doc.setFont('helvetica', 'normal');

      autoTable(doc, {
        startY: HEADER_H + 18,
        head: [['#', 'Student Name', 'Student No.', 'Class', 'Item Type', 'JP-Number', 'Condition', 'Status', 'Date Issued']],
        body: this.reportFurniture.length
          ? this.reportFurniture.map((r, i) => [
              i + 1,
              `${r.student?.firstName || ''} ${r.student?.lastName || ''}`.trim() || '—',
              r.student?.studentNumber || '—',
              r.student?.classEntity?.name || classLabel,
              (r.furnitureItem?.itemType || '—').toUpperCase(),
              r.furnitureItem?.itemCode || '—',
              (r.furnitureItem?.condition || '—').toUpperCase(),
              (r.status || '—').toUpperCase(),
              r.issuedAt ? new Date(r.issuedAt).toLocaleDateString() : '—'
            ])
          : [['', 'No furniture records found.', '', '', '', '', '', '', '']],
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [22, 101, 52], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [240, 255, 245] },
        columnStyles: {
          4: { fontStyle: 'bold' },
          5: { fontStyle: 'bold', textColor: [22, 101, 52] }
        },
        margin: { left: 14, right: 14 }
      });
    }

    const addPageFooters = (d: jsPDF) => {
      const pageCount = d.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        d.setPage(i);
        d.setFontSize(7);
        d.setTextColor(160);
        d.text(
          `Page ${i} of ${pageCount}  •  Confidential — For internal use only`,
          pageW / 2, d.internal.pageSize.getHeight() - 5, { align: 'center' }
        );
      }
    };
    addPageFooters(doc);

    return doc;
  }

  downloadPDF(section: 'textbooks' | 'furniture' | 'both') {
    const doc = this.buildPDF(section);
    const fileName = section === 'both'
      ? 'inventory-report-full.pdf'
      : `inventory-report-${section}.pdf`;
    doc.save(fileName);
  }

  previewPDF(section: 'textbooks' | 'furniture' | 'both') {
    this._revokeBlobUrl();
    const doc = this.buildPDF(section);
    const blob = doc.output('blob');
    this._blobUrl = URL.createObjectURL(blob);
    this.pdfPreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this._blobUrl);
    this.pdfPreviewSection = section;
  }
}
