import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ChatbotFaq, ChatbotService } from '../../../services/chatbot.service';

@Component({
  standalone: false,
  selector: 'app-chatbot-faq-admin',
  templateUrl: './chatbot-faq-admin.component.html',
  styleUrls: ['./chatbot-faq-admin.component.css'],
})
export class ChatbotFaqAdminComponent implements OnInit {
  faqs: ChatbotFaq[] = [];
  loading = true;
  error = '';
  success = '';
  saving = false;
  editing: ChatbotFaq | null = null;
  formOpen = false;
  search = '';
  categoryFilter = 'all';
  statusFilter: 'all' | 'active' | 'inactive' = 'all';
  expandedId: string | null = null;

  form: ChatbotFaq = this.emptyForm();

  readonly categories = ['general', 'admissions', 'fees', 'reports', 'account'];
  readonly audiences = [
    { value: 'all', label: 'Everyone' },
    { value: 'public', label: 'Public / guests' },
    { value: 'applicant', label: 'Applicants' },
    { value: 'parent', label: 'Parents' },
    { value: 'student', label: 'Students' },
    { value: 'teacher', label: 'Teachers' },
    { value: 'admin', label: 'Admins' },
    { value: 'all,public,applicant,parent', label: 'Public + parents + applicants' },
  ];

  constructor(
    private chatbot: ChatbotService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.load();
  }

  get activeCount(): number {
    return this.faqs.filter((f) => f.isActive !== false).length;
  }

  get inactiveCount(): number {
    return this.faqs.filter((f) => f.isActive === false).length;
  }

  get filteredFaqs(): ChatbotFaq[] {
    const q = this.search.trim().toLowerCase();
    return this.faqs.filter((f) => {
      if (this.categoryFilter !== 'all' && (f.category || 'general') !== this.categoryFilter) {
        return false;
      }
      if (this.statusFilter === 'active' && f.isActive === false) return false;
      if (this.statusFilter === 'inactive' && f.isActive !== false) return false;
      if (!q) return true;
      const hay = `${f.question} ${f.answer} ${f.keywords || ''} ${f.category} ${f.audience}`.toLowerCase();
      return hay.includes(q);
    });
  }

  emptyForm(): ChatbotFaq {
    return {
      question: '',
      answer: '',
      keywords: '',
      category: 'general',
      audience: 'all',
      sortOrder: 0,
      isActive: true,
    };
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.chatbot.listFaqs(true).subscribe({
      next: (list) => {
        this.faqs = Array.isArray(list) ? list : [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Failed to load FAQs';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  startCreate(): void {
    this.editing = null;
    this.form = this.emptyForm();
    this.form.sortOrder = (this.faqs.length + 1) * 10;
    this.formOpen = true;
    this.success = '';
    this.error = '';
  }

  startEdit(faq: ChatbotFaq): void {
    this.editing = faq;
    this.form = {
      question: faq.question,
      answer: faq.answer,
      keywords: faq.keywords || '',
      category: faq.category || 'general',
      audience: faq.audience || 'all',
      sortOrder: faq.sortOrder || 0,
      isActive: faq.isActive !== false,
    };
    this.formOpen = true;
    this.success = '';
    this.error = '';
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      /* ignore */
    }
  }

  cancelEdit(): void {
    this.editing = null;
    this.form = this.emptyForm();
    this.formOpen = false;
  }

  save(): void {
    const question = (this.form.question || '').trim();
    const answer = (this.form.answer || '').trim();
    if (!question || !answer || this.saving) return;

    this.saving = true;
    this.error = '';
    this.success = '';
    const payload: ChatbotFaq = {
      ...this.form,
      question,
      answer,
      keywords: (this.form.keywords || '').trim() || null,
    };

    const req$ = this.editing?.id
      ? this.chatbot.updateFaq(this.editing.id, payload)
      : this.chatbot.createFaq(payload);

    req$.subscribe({
      next: () => {
        this.saving = false;
        this.success = this.editing ? 'FAQ updated successfully.' : 'FAQ created successfully.';
        this.cancelEdit();
        this.load();
      },
      error: (err: any) => {
        this.saving = false;
        this.error = err?.error?.message || 'Save failed';
        this.cdr.detectChanges();
      },
    });
  }

  remove(faq: ChatbotFaq): void {
    if (!faq.id || !confirm(`Delete FAQ:\n“${faq.question}”?`)) return;
    this.chatbot.deleteFaq(faq.id).subscribe({
      next: () => {
        this.success = 'FAQ deleted.';
        if (this.editing?.id === faq.id) this.cancelEdit();
        this.load();
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Delete failed';
        this.cdr.detectChanges();
      },
    });
  }

  toggleActive(faq: ChatbotFaq): void {
    if (!faq.id) return;
    this.chatbot.updateFaq(faq.id, { isActive: !faq.isActive }).subscribe({
      next: () => {
        this.success = faq.isActive ? 'FAQ disabled.' : 'FAQ enabled.';
        this.load();
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Update failed';
        this.cdr.detectChanges();
      },
    });
  }

  toggleExpand(faq: ChatbotFaq): void {
    const id = faq.id || null;
    this.expandedId = this.expandedId === id ? null : id;
  }

  categoryLabel(cat: string | undefined): string {
    const c = (cat || 'general').toLowerCase();
    return c.charAt(0).toUpperCase() + c.slice(1);
  }

  audienceLabel(audience: string | undefined): string {
    const a = audience || 'all';
    const found = this.audiences.find((x) => x.value === a);
    return found?.label || a;
  }

  clearFilters(): void {
    this.search = '';
    this.categoryFilter = 'all';
    this.statusFilter = 'all';
  }
}
