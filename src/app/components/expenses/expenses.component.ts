// src/app/features/expenses/expenses.component.ts
import { Component, OnInit, signal, computed, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedStateService, Expense, ExpenseType } from '../../services/shared-state.service';
import { ConstantsService } from '../../services/constants.service';

// Presentation-only — stays local, not business data
const TYPE_META: Record<string, { icon: string; color: string; bg: string }> = {
  'Petrol':              { icon: 'bi-fuel-pump-fill',        color: '#0057FF', bg: '#e8f0ff' },
  'Vehicle Maintenance': { icon: 'bi-wrench-adjustable',     color: '#F59E0B', bg: '#fef3c7' },
  'Salary':              { icon: 'bi-person-badge-fill',     color: '#8B5CF6', bg: '#ede9fe' },
  'Rent':                { icon: 'bi-building-fill',         color: '#06B6D4', bg: '#cffafe' },
  'Electricity':         { icon: 'bi-lightning-charge-fill', color: '#EF4444', bg: '#fee2e2' },
  'Misc':                { icon: 'bi-three-dots',            color: '#6B7280', bg: '#f3f4f6' },
};
const DEFAULT_TYPE_META = { icon: 'bi-tag-fill', color: '#6B7280', bg: '#f3f4f6' };

export interface WorkerOption { id: number; name: string; salary: number; }

@Component({
  selector:    'app-expenses',
  standalone:  true,
  imports:     [CommonModule, FormsModule],
  templateUrl: './expenses.component.html',
  styleUrls:   ['./expenses.component.css'],
})
export class ExpensesComponent implements OnInit {

  private readonly cSvc = inject(ConstantsService);

  expenses   = signal<Expense[]>([]);
  summary    = signal<{ totalThisMonth: number; byType: { type: string; amount: number }[] }>({
    totalThisMonth: 0, byType: [],
  });
  isLoading  = signal(true);
  isSaving   = signal(false);
  isDeleting = signal(false);

  isMobile = signal(window.innerWidth <= 768);
  @HostListener('window:resize')
  onResize(): void { this.isMobile.set(window.innerWidth <= 768); }

  workers = computed<WorkerOption[]>(() =>
    this.svc.users()
      .filter(u => u.status === 'Active')
      .map(u => ({ id: u.id, name: u.name, salary: u.salaryDetails?.monthlySalary ?? 0 }))
  );

  // ── Template: *ngFor="let t of expenseTypes"
  //    then:  formType()===t         (string === string ✓)
  //           formType.set(t)        (string arg ✓)
  //           filterType()===t       (string === string ✓)
  //           typeMeta[t]            (string index ✓)
  //   → expenseTypes MUST return string[]
  get expenseTypes(): string[] { return this.cSvc.expenseTypeValues(); }

  // TYPE_META exposed for template: typeMeta[t]?.icon etc.
  readonly typeMeta = TYPE_META;

  // ── Filters ───────────────────────────────────────────────────────────────
  dateFilter  = signal<'today' | 'week' | 'month' | 'custom'>('month');
  dateFrom    = signal(this.firstOfMonth());
  dateTo      = signal(this.today());
  filterType  = signal<string>('all');
  searchQuery = signal('');

  // ── Pagination ────────────────────────────────────────────────────────────
  totalCount  = signal(0);
  currentPage = signal(1);
  readonly pageSize = 10;

  totalPages    = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.pageSize)));
  pages         = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));
  pagedExpenses = computed(() => this.expenses());

  filteredTotalAmount = signal(0);
  filteredTotal       = computed(() => this.expenses().reduce((s, e) => s + e.amount, 0));

  // ── Modal ─────────────────────────────────────────────────────────────────
  showModal      = signal(false);
  editingExpense = signal<Expense | null>(null);

  // Template: formType.set(t)  where t is string
  // formType stores a string (typed as ExpenseType for compatibility downstream)
  formType       = signal<string>(this.cSvc.expenseTypeValues()[0] ?? 'Petrol');
  formAmount     = signal(0);
  formDate       = signal(this.today());
  formNotes      = signal('');
  selectedWorker = signal<number | null>(null);
  deleteTarget   = signal<Expense | null>(null);

  toastMsg  = signal('');
  toastType = signal<'success' | 'error'>('success');

  topCategory = computed(() => {
    const by = this.summary().byType;
    return by.length ? by.reduce((a, b) => a.amount > b.amount ? a : b) : null;
  });

  constructor(private svc: SharedStateService) {}

  ngOnInit(): void { this.loadAll(); }

  loadAll(): void {
    this.isLoading.set(true);
    let done = 0;
    const fin = (err?: unknown) => {
      if (err) this.toast('Failed to load data. Please refresh.', 'error');
      if (++done === 3) this.isLoading.set(false);
    };
    this.loadExpenses(fin);
    this.refreshSummary(fin);
    this.svc.getUsers().subscribe({ next: () => fin(), error: e => fin(e) });
  }

  loadExpenses(callback?: (err?: unknown) => void): void {
    const df = this.dateFilter();
    let from: string | undefined;
    let to:   string | undefined;
    if (df === 'today')  { from = to = this.today(); }
    if (df === 'week')   { from = this.daysAgo(7);     to = this.today(); }
    if (df === 'month')  { from = this.firstOfMonth(); to = this.today(); }
    if (df === 'custom') { from = this.dateFrom() || undefined; to = this.dateTo() || undefined; }

    const typeVal = this.filterType();
    const search  = this.searchQuery().trim();

    this.svc.getExpenses({
      page: this.currentPage(), pageSize: this.pageSize,
      from, to,
      type:   typeVal !== 'all' ? typeVal as ExpenseType : undefined,
      search: search || undefined,
    }).subscribe({
      next: paged => {
        this.expenses.set(paged.items);
        this.totalCount.set(paged.totalCount);
        this.filteredTotalAmount.set(paged.totalAmount ?? 0);
        callback?.();
      },
      error: e => { this.toast('Failed to load expenses.', 'error'); callback?.(e); },
    });
  }

  private refreshSummary(callback?: (err?: unknown) => void): void {
    this.svc.getExpenseSummary().subscribe({
      next: s  => { this.summary.set(s); callback?.(); },
      error: e => callback?.(e),
    });
  }

  // ── trackBy ───────────────────────────────────────────────────────────────
  trackByExpenseId(_: number, e: Expense): number               { return e.id; }
  // Template: trackBy: trackByType  where t is string
  trackByType(_: number, t: string): string                     { return t; }
  trackBySummaryType(_: number, item: { type: string }): string { return item.type; }
  trackByPage(_: number, p: number): number                     { return p; }

  // ── Date presets ──────────────────────────────────────────────────────────
  setDateFilter(f: 'today' | 'week' | 'month'): void {
    this.dateFilter.set(f);
    if (f === 'today') { this.dateFrom.set(this.today());        this.dateTo.set(this.today()); }
    if (f === 'week')  { this.dateFrom.set(this.daysAgo(7));     this.dateTo.set(this.today()); }
    if (f === 'month') { this.dateFrom.set(this.firstOfMonth()); this.dateTo.set(this.today()); }
    this.currentPage.set(1);
    this.loadExpenses();
  }

  applyCustomRange(): void { this.dateFilter.set('custom'); this.currentPage.set(1); this.loadExpenses(); }
  onFilter(): void         { this.currentPage.set(1); this.loadExpenses(); }

  goPage(p: number): void {
    if (p >= 1 && p <= this.totalPages()) { this.currentPage.set(p); this.loadExpenses(); }
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  openAdd(): void {
    this.editingExpense.set(null);
    // Set to first type from DB (string)
    this.formType.set(this.cSvc.expenseTypeValues()[0] ?? 'Petrol');
    this.formAmount.set(0);
    this.formDate.set(this.today());
    this.formNotes.set('');
    this.selectedWorker.set(null);
    this.showModal.set(true);
  }

  openEdit(e: Expense, ev: Event): void {
    ev.stopPropagation();
    this.editingExpense.set(e);
    this.formType.set(e.type);           // e.type is ExpenseType (string)
    this.formAmount.set(e.amount);
    this.formDate.set(this._toLocalDateString(e.date));
    this.formNotes.set(e.notes ?? '');
    this.selectedWorker.set(null);
    this.showModal.set(true);
  }

  closeModal(): void { this.showModal.set(false); }

  onWorkerChange(workerId: string | number): void {
    const id = +workerId;
    this.selectedWorker.set(id);
    const w = this.workers().find(w => w.id === id);
    if (w) { this.formAmount.set(w.salary); this.formNotes.set(`Salary – ${w.name}`); }
  }

  save(): void {
    if (!this.formAmount() || this.formAmount() <= 0) {
      this.toast('Enter a valid amount.', 'error'); return;
    }
    this.isSaving.set(true);
    const payload: Partial<Expense> = {
      type:   this.formType() as ExpenseType,
      amount: this.formAmount(),
      date:   new Date(this.formDate() + 'T00:00:00'),
      notes:  this.formNotes(),
    };
    const editing = this.editingExpense();

    if (editing) {
      this.svc.updateExpense(editing.id, payload).subscribe({
        next: () => {
          this.loadExpenses(); this.refreshSummary();
          this.toast('Expense updated.', 'success');
          this.closeModal(); this.isSaving.set(false);
        },
        error: (err: Error) => { this.toast(err.message || 'Update failed.', 'error'); this.isSaving.set(false); },
      });
    } else {
      this.svc.createExpense(payload).subscribe({
        next: () => {
          this.currentPage.set(1); this.loadExpenses(); this.refreshSummary();
          this.toast('Expense added.', 'success');
          this.closeModal(); this.isSaving.set(false);
        },
        error: (err: Error) => { this.toast(err.message || 'Save failed.', 'error'); this.isSaving.set(false); },
      });
    }
  }

  confirmDelete(e: Expense, ev: Event): void { ev.stopPropagation(); this.deleteTarget.set(e); }

  doDelete(): void {
    const e = this.deleteTarget();
    if (!e) return;
    this.isDeleting.set(true);
    this.svc.deleteExpense(e.id).subscribe({
      next: () => {
        const newTotal = Math.max(0, this.totalCount() - 1);
        const maxPage  = Math.max(1, Math.ceil(newTotal / this.pageSize));
        if (this.currentPage() > maxPage) this.currentPage.set(maxPage);
        this.loadExpenses(); this.refreshSummary();
        this.toast('Expense deleted.', 'success');
        this.deleteTarget.set(null); this.isDeleting.set(false);
      },
      error: (err: Error) => {
        this.toast(err.message || 'Delete failed.', 'error');
        this.deleteTarget.set(null); this.isDeleting.set(false);
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  toast(msg: string, type: 'success' | 'error'): void {
    this.toastMsg.set(msg); this.toastType.set(type);
    setTimeout(() => this.toastMsg.set(''), 3000);
  }

  getTypeMeta(type: string): { icon: string; color: string; bg: string } {
    return TYPE_META[type] ?? DEFAULT_TYPE_META;
  }

  formatDate(d: Date | string | null | undefined): string {
    if (!d) return '—';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  today(): string         { return new Date().toISOString().slice(0, 10); }
  firstOfMonth(): string  { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }
  daysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

  getTypePercent(type: string): number {
    const total = this.summary().totalThisMonth;
    if (!total) return 0;
    const found = this.summary().byType.find(b => b.type === type);
    return found ? Math.round((found.amount / total) * 100) : 0;
  }

  private _toLocalDateString(d: Date | string | null | undefined): string {
    if (!d) return this.today();
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return this.today();
    const y   = dt.getFullYear();
    const m   = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}