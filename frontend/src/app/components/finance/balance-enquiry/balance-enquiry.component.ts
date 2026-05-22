import { Component, OnInit, OnDestroy, HostListener, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { pdfBlobViewerUrl } from '../../../utils/pdf-preview.util';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import jsPDF from 'jspdf';
import {
  drawPaymentBankingDetailsJsPdf,
  PaymentBankingDetails,
  resolvePaymentBankingDetails
} from '../../../utils/payment-banking-pdf.util';

@Component({
  standalone: false,  selector: 'app-balance-enquiry',
  templateUrl: './balance-enquiry.component.html',
  styleUrls: ['./balance-enquiry.component.css', './balance-enquiry-modern.css']
})
export class BalanceEnquiryComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly searchInput$ = new Subject<string>();

  query = '';
  lastLoadedAt: Date | null = null;
  loading = false;
  error = '';
  success = '';
  currencySymbol = 'USD';
  schoolName = '';
  schoolAddress = '';
  schoolMotto = '';
  schoolLogo2: string | null = null;
  deskFee = 0;
  paymentBanking: PaymentBankingDetails | null = null;
  
  studentData: any = null;
  matchingStudents: any[] = [];
  selectedMatchId = '';
  latestInvoice: any = null;
  
  previewUrl: SafeResourceUrl | null = null;
  previewBlobUrl: string | null = null;
  loadingPdf = false;
  previewMode = false;

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private sanitizer: DomSanitizer,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.searchInput$
      .pipe(debounceTime(400), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => {
        if (q.length >= 3) {
          this.search();
        }
      });

    activatePageLoad(this.router, this.destroy$, '/balance-enquiry', () => this.loadSettings());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.previewBlobUrl) {
      window.URL.revokeObjectURL(this.previewBlobUrl);
    }
}

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.previewUrl) {
      this.clearPreview();
    } else if (this.query) {
      this.clearSearch();
    }
  }

  loadSettings(): void {
    this.settingsService
      .getSettings()
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
        next: (s: any) => {
          this.currencySymbol = s?.currencySymbol || 'USD';
          this.schoolName = s?.schoolName || '';
          this.schoolAddress = s?.schoolAddress || '';
          this.schoolMotto = s?.schoolMotto || '';
          this.schoolLogo2 = s?.schoolLogo2 || null;
          this.deskFee = isFinite(Number(s?.feesSettings?.deskFee)) ? Number(s.feesSettings.deskFee) : 0;
          this.paymentBanking = resolvePaymentBankingDetails(
            s?.feesSettings?.paymentBanking,
            s?.schoolName
          );
        },
        error: () => {
          this.currencySymbol = 'USD';
        }
      });
}

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.split(' ').filter(p => p);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  clearAlert(kind: 'success' | 'error'): void {
    if (kind === 'success') this.success = '';
    else this.error = '';
  }

  onSearchInput(): void {
    this.searchInput$.next((this.query || '').trim());
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  }

  trackByStudentId(_index: number, s: any): string {
    return s.studentId || String(_index);
  }

  get recordPaymentQueryParams(): Record<string, string | number> {
    if (!this.studentData) return {};
    return {
      studentId: this.studentData.studentNumber || this.studentData.studentId,
      firstName: this.studentData.firstName || '',
      lastName: this.studentData.lastName || '',
      balance: this.studentData.balance ?? 0
    };
  }

  clearSearch(): void {
    this.query = '';
    this.studentData = null;
    this.matchingStudents = [];
    this.selectedMatchId = '';
    this.latestInvoice = null;
    this.error = '';
    this.success = '';
    this.clearPreview();
  }

  search(): void {
    if (!this.query || this.query.trim() === '') {
      this.error = 'Please enter a Student ID, Name, or Student Number';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';
    this.studentData = null;
    this.matchingStudents = [];
    this.selectedMatchId = '';
    this.latestInvoice = null;
    this.clearPreview();

    this.cdr.detectChanges();
    this.financeService
      .getStudentBalance(this.query.trim())
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (data: any) => {
          if (data?.multipleMatches && Array.isArray(data.matches) && data.matches.length > 0) {
            this.matchingStudents = data.matches;
            return;
          }
          this.studentData = data;
          this.lastLoadedAt = new Date();
          this.loadLatestInvoiceInBackground();
        },
        error: (err: any) => {
          this.error =
            err?.error?.message || 'Student not found. Please check the details and try again.';
        }
      });
  }

  selectStudent(studentId: string): void {
    this.selectedMatchId = studentId;
    this.onSelectMatch();
  }

  onSelectMatch(): void {
    if (!this.selectedMatchId) return;

    this.loading = true;
    this.error = '';
    this.success = '';
    this.studentData = null;
    this.latestInvoice = null;
    this.clearPreview();

    this.cdr.detectChanges();
    this.financeService
      .getStudentBalance(this.selectedMatchId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (data: any) => {
          this.studentData = data;
          this.matchingStudents = [];
          this.lastLoadedAt = new Date();
          this.loadLatestInvoiceInBackground();
        },
        error: (err: any) => {
          this.error = err?.error?.message || 'Failed to get balance';
        }
      });
  }

  /** Load only the latest invoice (by id from balance API), not the full invoice list. */
  private loadLatestInvoiceInBackground(): void {
    const invoiceId = this.studentData?.lastInvoiceId;
    if (!invoiceId) {
      this.latestInvoice = null;
      return;
    }

    this.financeService
      .getInvoice(invoiceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (invoice: any) => {
          this.latestInvoice = invoice || null;
          this.cdr.markForCheck();
        },
        error: () => {
          this.latestInvoice = null;
        }
      });
  }

  async loadLatestInvoice(): Promise<void> {
    const invoiceId = this.studentData?.lastInvoiceId;
    if (!invoiceId) {
      this.latestInvoice = null;
      return;
    }
    try {
      const invoice = await firstValueFrom(
        this.financeService.getInvoice(invoiceId).pipe(takeUntil(this.destroy$))
      );
      this.latestInvoice = invoice || null;
    } catch {
      this.latestInvoice = null;
    }
  }

  colorForBalance(): string {
    if (!this.studentData) return '';
    const bal = parseFloat(String(this.studentData.balance || 0));
    return bal > 1000 ? '#dc2626' : '#2563eb';
  }

  async previewStatement(): Promise<void> {
    if (!this.studentData) return;

    this.loadingPdf = true;
    this.previewMode = true;
    this.error = '';
    this.revokeStatementPreviewUrlsOnly();

    try {
      await this.yieldToBrowser();
      this.cdr.detectChanges();

      const latestInvoice = await this.getInvoiceForStatement();
      const blob = this.buildStatementPDFBlob(this.studentData, latestInvoice);
      const url = URL.createObjectURL(blob);
      this.previewBlobUrl = url;
      this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(pdfBlobViewerUrl(url));
    } catch (e: any) {
      this.error = e?.message || 'Failed to load statement preview';
    } finally {
      this.finishPdfOperation();
    }
  }

  async downloadStatement(): Promise<void> {
    if (!this.studentData) return;

    this.loadingPdf = true;
    this.previewMode = false;
    this.error = '';
    this.cdr.detectChanges();

    let objectUrl: string | null = null;
    try {
      await this.yieldToBrowser();

      const latestInvoice = await this.getInvoiceForStatement();
      const blob = this.buildStatementPDFBlob(this.studentData, latestInvoice);
      objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `Invoice_Statement_${this.studentData.studentNumber || this.studentData.studentId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // After a programmatic download, some browsers defer focus/UI work; clear loading on the next turn
      // so the template always leaves "Generating..." and change detection runs reliably.
      this.success = 'Statement downloaded successfully!';
      setTimeout(() => {
        this.finishPdfOperation();
      }, 0);
      setTimeout(() => {
        this.success = '';
      }, 3000);
      setTimeout(() => {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
      }, 60_000);
    } catch (e: any) {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      this.error = e?.message || 'Failed to download statement';
      this.finishPdfOperation();
    }
  }

  async printStatement(): Promise<void> {
    if (!this.studentData) return;

    this.loadingPdf = true;
    this.previewMode = false;
    this.error = '';
    this.cdr.detectChanges();

    try {
      await this.yieldToBrowser();

      const latestInvoice = await this.getInvoiceForStatement();
      const blob = this.buildStatementPDFBlob(this.studentData, latestInvoice);
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    } catch (e: any) {
      this.error = e?.message || 'Failed to print statement';
    } finally {
      this.finishPdfOperation();
    }
  }

  clearPreview(): void {
    this.revokeStatementPreviewUrlsOnly();
    this.previewMode = false;
    this.cdr.markForCheck();
  }

  /** Drop blob URL / iframe src without changing previewMode (used before rebuilding preview). */
  private revokeStatementPreviewUrlsOnly(): void {
    if (this.previewBlobUrl) {
      URL.revokeObjectURL(this.previewBlobUrl);
      this.previewBlobUrl = null;
    }
    this.previewUrl = null;
  }

  private async loadLatestInvoiceForStudent(studentId: string): Promise<any | null> {
    const invoices = await firstValueFrom(this.financeService.getInvoices(studentId, undefined));
    if (Array.isArray(invoices) && invoices.length > 0) {
      return invoices[0];
    }
    return null;
  }

  /** Reuse invoice already loaded with the student when possible (faster preview/download/print). */
  private async getInvoiceForStatement(): Promise<any | null> {
    const sid = this.studentData?.studentId;
    if (!sid) return null;
    if (this.latestInvoice) {
      return this.latestInvoice;
    }
    const inv = await this.loadLatestInvoiceForStudent(sid);
    this.latestInvoice = inv;
    return inv;
  }

  /** Let the browser paint the loading state before heavy jsPDF work on the main thread. */
  private yieldToBrowser(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  private finishPdfOperation(): void {
    this.loadingPdf = false;
    this.cdr.detectChanges();
  }

  private buildStatementPDFBlob(student: any, invoice: any | null): Blob {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    
    try {
      if (this.schoolLogo2) {
        pdf.addImage(this.schoolLogo2, 'PNG', 10, 10, 20, 20);
      }
    } catch {}
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text(this.schoolName || 'School', 105, 18, { align: 'center' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    if (this.schoolMotto) pdf.text(this.schoolMotto, 105, 25, { align: 'center' });
    if (this.schoolAddress) pdf.text(this.schoolAddress, 105, 31, { align: 'center' });
    pdf.setLineWidth(0.5);
    pdf.line(10, 36, 200, 36);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('Invoice Statement', 105, 46, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(12);
    const startY = 58;
    pdf.text(`Student: ${student.fullName || ''}`, 14, startY);
    pdf.text(`Student #: ${student.studentNumber || student.studentId || ''}`, 14, startY + 8);
    pdf.text(`Generated: ${new Date().toLocaleString()}`, 14, startY + 16);

    const tryNum = (v: any) => isFinite(Number(v)) ? Number(v) : 0;
    // Use API balance (same rules as outstanding-fees / record payment)
    const bal = Math.max(0, tryNum(student.balance));
    
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(bal > 1000 ? 220 : 37, bal > 1000 ? 38 : 99, bal > 1000 ? 38 : 235);
    pdf.text(`Current Balance: ${this.currencySymbol} ${bal.toFixed(2)}`, 14, startY + 28);
    pdf.setTextColor(0, 0, 0);

    let contentEndY = startY + 28;

    if (invoice) {
      let y = startY + 42;
      pdf.setFont('helvetica', 'bold');
      pdf.text('Latest Invoice Summary', 14, y);
      y += 6;
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Invoice #: ${invoice.invoiceNumber || invoice.id || ''}`, 14, y);
      y += 6;
      pdf.text(`Term: ${invoice.term || 'N/A'}`, 14, y);
      y += 6;
      pdf.text(`Due Date: ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'}`, 14, y);
      y += 8;

      const items: Array<{ label: string; amount: number }> = [];
      if (Array.isArray(invoice.items) && invoice.items.length > 0) {
        invoice.items.forEach((it: any) => {
          const label = (it.item || it.description || 'Item').toString();
          const amount = tryNum(it.amount);
          if (amount > 0) items.push({ label, amount });
        });
      }
      
      const tuitionAmount = tryNum(invoice.tuitionAmount);
      if (tuitionAmount > 0 && !items.find(i => i.label.toLowerCase().includes('tuition'))) {
        items.push({ label: 'Tuition', amount: tuitionAmount });
      }
      const diningHallAmount = tryNum(invoice.diningHallAmount);
      if (diningHallAmount > 0 && !items.find(i => i.label.toLowerCase().includes('dining'))) {
        items.push({ label: 'Dining Hall', amount: diningHallAmount });
      }
      const transportAmount = tryNum((invoice as any).transportAmount || (invoice as any).transportCost);
      if (transportAmount > 0 && !items.find(i => i.label.toLowerCase().includes('transport'))) {
        items.push({ label: 'Transport', amount: transportAmount });
      }
      if (items.length === 0) {
        items.push({ label: 'Fees', amount: tryNum(invoice.amount) });
      }

      const tableStartX = 14;
      const colWidths = [110, 60];
      const rowHeight = 8;
      let currentY = y;

      pdf.setDrawColor(50, 50, 50);
      pdf.setFillColor(245, 247, 250);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'bold');
      pdf.rect(tableStartX, currentY, colWidths[0], rowHeight, 'FD');
      pdf.rect(tableStartX + colWidths[0], currentY, colWidths[1], rowHeight, 'FD');
      pdf.text('Item', tableStartX + 3, currentY + 5);
      pdf.text('Amount', tableStartX + colWidths[0] + 3, currentY + 5);
      currentY += rowHeight;

      pdf.setFont('helvetica', 'normal');
      items.forEach(row => {
        pdf.rect(tableStartX, currentY, colWidths[0], rowHeight);
        pdf.rect(tableStartX + colWidths[0], currentY, colWidths[1], rowHeight);
        pdf.text(row.label, tableStartX + 3, currentY + 5);
        const amtText = `${this.currencySymbol} ${Number(row.amount).toFixed(2)}`;
        pdf.text(amtText, tableStartX + colWidths[0] + 3, currentY + 5);
        currentY += rowHeight;
      });

      const totalsLabelWidth = 110;
      const totalsValueWidth = 60;
      const drawTotalRow = (label: string, value: number, bold = false, color?: [number, number, number]) => {
        pdf.rect(tableStartX, currentY, totalsLabelWidth, rowHeight);
        pdf.rect(tableStartX + totalsLabelWidth, currentY, totalsValueWidth, rowHeight);
        if (bold) pdf.setFont('helvetica', 'bold');
        else pdf.setFont('helvetica', 'normal');
        if (color) pdf.setTextColor(color[0], color[1], color[2]);
        else pdf.setTextColor(0, 0, 0);
        pdf.text(label, tableStartX + 3, currentY + 5);
        const txt = `${this.currencySymbol} ${Number(value || 0).toFixed(2)}`;
        pdf.text(txt, tableStartX + totalsLabelWidth + 3, currentY + 5);
        pdf.setTextColor(0, 0, 0);
        currentY += rowHeight;
      };

      const normalizedStatus = String((student as any).studentStatus || '').trim().toLowerCase();
      const isNewStudent = normalizedStatus === 'new';
      const configuredDeskFee = tryNum(this.deskFee);

      const totalAmount = tryNum(invoice.amount);
      const paidAmount = tryNum((invoice as any).paidAmount);
      let previousBalance = tryNum((invoice as any).previousBalance);
      const prepaidAmount = tryNum((invoice as any).prepaidAmount);

      if (!isNewStudent && configuredDeskFee > 0) {
        const prev = Number(previousBalance.toFixed(2));
        const desk = Number(configuredDeskFee.toFixed(2));
        if (prev === desk) {
          previousBalance = 0;
        }
      }

      const lineItemSubtotal =
        tryNum(invoice.tuitionAmount) +
        tryNum(invoice.diningHallAmount) +
        tryNum((invoice as any).transportAmount) +
        tryNum((invoice as any).registrationAmount) +
        tryNum((invoice as any).deskFeeAmount);
      const effectiveAmount = Math.max(totalAmount, lineItemSubtotal);
      const invBalance = Math.max(
        0,
        Math.max(bal, parseFloat((effectiveAmount + previousBalance - paidAmount - prepaidAmount).toFixed(2)))
      );
      const computedSubtotal = items.reduce((sum, row) => sum + tryNum(row.amount), 0);
      const subtotalToShow = computedSubtotal > 0 ? computedSubtotal : totalAmount;
      
      drawTotalRow('Subtotal', subtotalToShow);
      drawTotalRow('Paid', paidAmount);
      drawTotalRow('Invoice Balance', invBalance, true, invBalance > 1000 ? [220, 38, 38] : [37, 99, 235]);
      contentEndY = currentY;
    }

    const afterBankingY = drawPaymentBankingDetailsJsPdf(
      pdf,
      this.paymentBanking,
      contentEndY + 10
    );

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    const footerY = Math.min(afterBankingY + 6, 285);
    pdf.text('This is a system-generated statement.', 105, footerY, { align: 'center' });
    return pdf.output('blob');
  }
}
