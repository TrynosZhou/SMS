import { Component } from '@angular/core';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import jsPDF from 'jspdf';

@Component({
  selector: 'app-balance-enquiry',
  templateUrl: './balance-enquiry.component.html',
  styleUrls: ['./balance-enquiry.component.css']
})
export class BalanceEnquiryComponent {
  query = '';
  loading = false;
  error = '';
  success = '';
  currencySymbol = '';
  schoolName = '';
  schoolAddress = '';
  schoolMotto = '';
  schoolLogo: string | null = null;
  // Result
  studentData: any = null;
  matchingStudents: any[] = [];
  selectedMatchId = '';
  // PDF preview
  previewUrl: SafeResourceUrl | null = null;
  previewBlobUrl: string | null = null;
  loadingPdf = false;

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private sanitizer: DomSanitizer
  ) {
    this.settingsService.getSettings().subscribe({
      next: (s: any) => {
        this.currencySymbol = s?.currencySymbol || 'KES';
        this.schoolName = s?.schoolName || '';
        this.schoolAddress = s?.schoolAddress || '';
        this.schoolMotto = s?.schoolMotto || '';
        this.schoolLogo = s?.schoolLogo || null;
      },
      error: () => {
        this.currencySymbol = 'KES';
      }
    });
  }

  search() {
    if (!this.query || this.query.trim() === '') {
      this.error = 'Enter Student ID, Student Number, Last Name, or First Name';
      return;
    }
    this.loading = true;
    this.error = '';
    this.success = '';
    this.studentData = null;
    this.matchingStudents = [];
    this.selectedMatchId = '';
    this.clearPreview();
    this.financeService.getStudentBalance(this.query.trim()).subscribe({
      next: (data: any) => {
        this.loading = false;
        if (data && data.multipleMatches && Array.isArray(data.matches) && data.matches.length > 0) {
          this.matchingStudents = data.matches;
          return;
        }
        this.studentData = data;
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to get balance';
      }
    });
  }

  onSelectMatch() {
    if (!this.selectedMatchId) return;
    this.loading = true;
    this.error = '';
    this.success = '';
    this.studentData = null;
    this.clearPreview();
    this.financeService.getStudentBalance(this.selectedMatchId).subscribe({
      next: (data: any) => {
        this.loading = false;
        this.studentData = data;
        this.matchingStudents = [];
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to get balance';
      }
    });
  }

  colorForBalance(): string {
    if (!this.studentData) return '';
    const bal = parseFloat(String(this.studentData.balance || 0));
    return bal > 1000 ? '#dc2626' : '#1d4ed8';
  }

  async previewStatement() {
    if (!this.studentData) return;
    this.loadingPdf = true;
    this.error = '';
    this.clearPreview();
    try {
      const latestInvoice = await this.loadLatestInvoiceForStudent(this.studentData.studentId);
      const blob = this.buildStatementPDFBlob(this.studentData, latestInvoice);
      const url = URL.createObjectURL(blob);
      this.previewBlobUrl = url;
      this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      this.loadingPdf = false;
    } catch (e: any) {
      this.loadingPdf = false;
      this.error = e?.message || 'Failed to load statement preview';
    }
  }

  async downloadStatement() {
    if (!this.studentData) return;
    this.loadingPdf = true;
    this.error = '';
    try {
      const latestInvoice = await this.loadLatestInvoiceForStudent(this.studentData.studentId);
      const blob = this.buildStatementPDFBlob(this.studentData, latestInvoice);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Invoice_Statement_${this.studentData.studentNumber || this.studentData.studentId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.loadingPdf = false;
    } catch (e: any) {
      this.loadingPdf = false;
      this.error = e?.message || 'Failed to download statement';
    }
  }

  clearPreview() {
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

  private buildStatementPDFBlob(student: any, invoice: any | null): Blob {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    try {
      if (this.schoolLogo) {
        pdf.addImage(this.schoolLogo, 'PNG', 10, 10, 20, 20);
      }
    } catch {}
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text(this.schoolName || 'School', 105, 18, { align: 'center' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    if (this.schoolMotto) pdf.text(this.schoolMotto, 105, 25, { align: 'center' });
    if (this.schoolAddress) pdf.text(this.schoolAddress, 105, 31, { align: 'center' });
    pdf.setLineWidth(0.5); pdf.line(10, 36, 200, 36);

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14);
    pdf.text('Invoice Statement', 105, 46, { align: 'center' });

    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(12);
    const startY = 58;
    pdf.text(`Student: ${student.fullName || ''}`, 14, startY);
    pdf.text(`Student #: ${student.studentNumber || student.studentId || ''}`, 14, startY + 8);
    pdf.text(`Generated: ${new Date().toLocaleString()}`, 14, startY + 16);

    const bal = parseFloat(String(student.balance || 0));
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(bal > 1000 ? 220 : 29, bal > 1000 ? 38 : 78, bal > 1000 ? 38 : 216);
    pdf.text(`Current Balance: ${this.currencySymbol} ${bal.toFixed(2)}`, 14, startY + 28);
    pdf.setTextColor(0, 0, 0);

    if (invoice) {
      let y = startY + 42;
      pdf.setFont('helvetica', 'bold');
      pdf.text('Latest Invoice Summary', 14, y);
      y += 6;
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Invoice #: ${invoice.invoiceNumber || invoice.id || ''}`, 14, y); y += 6;
      pdf.text(`Term: ${invoice.term || 'N/A'}`, 14, y); y += 6;
      pdf.text(`Due Date: ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'}`, 14, y); y += 8;

      // Build cost items dynamically
      const items: Array<{ label: string; amount: number }> = [];
      const tryNum = (v: any) => isFinite(Number(v)) ? Number(v) : 0;
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
      // Fallback single-line item if nothing else is available
      if (items.length === 0) {
        items.push({ label: 'Fees', amount: tryNum(invoice.amount) });
      }

      // Draw table header
      const tableStartX = 14;
      const colWidths = [110, 60]; // Item, Amount
      const rowHeight = 8;
      let currentY = y;

      pdf.setDrawColor(50, 50, 50);
      pdf.setFillColor(245, 247, 250);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'bold');
      // Header cell background
      pdf.rect(tableStartX, currentY, colWidths[0], rowHeight, 'FD');
      pdf.rect(tableStartX + colWidths[0], currentY, colWidths[1], rowHeight, 'FD');
      pdf.text('Item', tableStartX + 3, currentY + 5);
      pdf.text('Amount', tableStartX + colWidths[0] + 3, currentY + 5);
      currentY += rowHeight;

      // Rows
      pdf.setFont('helvetica', 'normal');
      items.forEach(row => {
        // row background (white), border
        pdf.rect(tableStartX, currentY, colWidths[0], rowHeight);
        pdf.rect(tableStartX + colWidths[0], currentY, colWidths[1], rowHeight);
        // Text
        pdf.text(row.label, tableStartX + 3, currentY + 5);
        const amtText = `${this.currencySymbol} ${Number(row.amount).toFixed(2)}`;
        pdf.text(amtText, tableStartX + colWidths[0] + 3, currentY + 5);
        currentY += rowHeight;
      });

      // Totals block under table with grid
      const totalsLabelWidth = 110;
      const totalsValueWidth = 60;
      const drawTotalRow = (label: string, value: number, bold = false, color?: [number, number, number]) => {
        pdf.rect(tableStartX, currentY, totalsLabelWidth, rowHeight);
        pdf.rect(tableStartX + totalsLabelWidth, currentY, totalsValueWidth, rowHeight);
        if (bold) pdf.setFont('helvetica', 'bold'); else pdf.setFont('helvetica', 'normal');
        if (color) pdf.setTextColor(color[0], color[1], color[2]); else pdf.setTextColor(0, 0, 0);
        pdf.text(label, tableStartX + 3, currentY + 5);
        const txt = `${this.currencySymbol} ${Number(value || 0).toFixed(2)}`;
        pdf.text(txt, tableStartX + totalsLabelWidth + 3, currentY + 5);
        pdf.setTextColor(0, 0, 0);
        currentY += rowHeight;
      };

      const totalAmount = tryNum(invoice.amount);
      const paidAmount = tryNum(invoice.paidAmount);
      const invBalance = tryNum(invoice.balance);
      drawTotalRow('Subtotal', totalAmount);
      drawTotalRow('Paid', paidAmount);
      drawTotalRow('Invoice Balance', invBalance, true, invBalance > 1000 ? [220, 38, 38] : [29, 78, 216]);
    }

    pdf.setFontSize(9);
    pdf.text('This is a system-generated statement.', 105, 290, { align: 'center' });
    return pdf.output('blob');
  }
}
