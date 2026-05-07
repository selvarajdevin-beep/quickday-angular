import { Component, OnInit, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { SharedStateService } from '../../services/shared-state.service';
import { Product, Supplier, Purchase, PurchaseItem, PurchaseStatus } from '../../services/shared-state.service';

interface BillRow {
  productId:    number;
  productName:  string;
  quantity:     number;
  pricePerUnit: number;
  total:        number;
}

type DateFilterMode = 'all' | 'today' | 'week' | 'custom';

@Component({
  selector:    'app-purchases',
  standalone:  true,
  imports:     [CommonModule, FormsModule],
  templateUrl: './purchases.component.html',
  styleUrls:   ['./purchases.component.css'],
})
export class PurchasesComponent implements OnInit {

  readonly Math = Math;

  // ── State ─────────────────────────────────────────────────────
  purchases  = signal<Purchase[]>([]);
  suppliers  = signal<Supplier[]>([]);
  summary    = signal({ totalThisMonth: 0, creditPending: 0, purchaseCount: 0 });
  isLoading  = signal(true);
  isSaving   = signal(false);

  isMobile = signal(window.innerWidth <= 768);
  @HostListener('window:resize')
  onResize(): void { this.isMobile.set(window.innerWidth <= 768); }

  // ── Server-driven pagination ───────────────────────────────────
  totalCount  = signal(0);
  currentPage = signal(1);
  readonly pageSize = 10;

  totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.pageSize)));
  pagesArr   = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));

  // ── Filters — sent to server ───────────────────────────────────
  filterStatus   = signal<'all' | 'Paid' | 'Credit'>('all');
  filterSupplier = signal<number | null>(null);
  searchQuery    = signal('');
  dateFilter     = signal<DateFilterMode>('all');
  dateFrom       = signal('');
  dateTo         = signal('');

  private searchSubject = new Subject<string>();

  // ── Form panel ────────────────────────────────────────────────
  showForm        = signal(false);
  editingPurchase = signal<Purchase | null>(null);
  formSupplier    = signal<Supplier | null>(null);
  supplierSearch  = signal('');
  showSupDrop     = signal(false);
  formRows        = signal<BillRow[]>([]);
  formPayStatus   = signal<PurchaseStatus>('Paid');
  formPaid        = signal(0);
  formNotes       = signal('');

  // ── Detail modal ──────────────────────────────────────────────
  viewPurchase = signal<Purchase | null>(null);

  // ── Toast ─────────────────────────────────────────────────────
  toastMsg  = signal('');
  toastType = signal<'success' | 'error'>('success');

  // ── Products — live from backend ──────────────────────────────
  readonly products = computed(() => this.svc.activeProducts());

  // ── pagedPurchases — server already paged ────────────────────
  pagedPurchases = computed(() => this.purchases());

  // ── Summary KPI signals ───────────────────────────────────────
  summaryTotal    = signal(0);
  creditPending   = signal(0);
  purchaseCount   = signal(0);

  formGrandTotal = computed(() => this.formRows().reduce((s, r) => s + r.total, 0));
  formBalance    = computed(() =>
    Math.max(0, this.formGrandTotal() -
      (this.formPayStatus() === 'Credit' ? 0 : this.formPaid()))
  );

  filteredSuppliers = computed(() => {
    const q      = this.supplierSearch().toLowerCase();
    const active = this.suppliers().filter(s => s.active);
    if (!q) return active.slice(0, 6);
    return active.filter(s =>
      s.name.toLowerCase().includes(q) || s.phone.includes(q)
    ).slice(0, 6);
  });

  panelTitle = computed(() =>
    this.editingPurchase()
      ? `Edit Purchase #${this.editingPurchase()!.id}`
      : 'New Purchase'
  );

  constructor(private svc: SharedStateService) {}

  // ── Init ──────────────────────────────────────────────────────
  ngOnInit(): void {
    // Debounce search
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
    ).subscribe(() => {
      this.currentPage.set(1);
      this.loadPurchases();
    });

    this.loadAll();
  }

  loadAll(): void {
    this.isLoading.set(true);
    let done = 0;
    const fin = (err?: unknown) => {
      if (err) this.toast('Failed to load data. Please refresh.', 'error');
      if (++done === 3) this.isLoading.set(false);
    };

    this.loadPurchases(fin);
    this.refreshSummary(fin);

    // this.svc.getSuppliers().subscribe({
    //   next: d  => { this.suppliers.set(d); fin(); },
    //   error: e => fin(e),
    // });

    this.svc.getSuppliers({ pageSize: 999, status: 'active' }).subscribe({
      next: d  => { this.suppliers.set(d.items); fin(); },
      error: e => fin(e),
    });

    // Products for form dropdown
    this.svc.getProducts({ pageSize: 200, activeOnly: true }).subscribe({
      error: () => { /* non-fatal */ },
    });
  }

  loadPurchases(callback?: (err?: unknown) => void): void {
    const status     = this.filterStatus();
    const supplierId = this.filterSupplier();
    const search     = this.searchQuery().trim();
    const df         = this.dateFilter();

    let dateFrom: string | undefined;
    let dateTo:   string | undefined;

    if (df === 'today') {
      dateFrom = dateTo = this.todayStr();
    } else if (df === 'week') {
      dateFrom = this.daysAgoStr(6);
      dateTo   = this.todayStr();
    } else if (df === 'custom') {
      dateFrom = this.dateFrom() || undefined;
      dateTo   = this.dateTo()   || undefined;
    }

    this.svc.getPurchases({
      page:       this.currentPage(),
      pageSize:   this.pageSize,
      status:     status === 'all' ? undefined : status,
      supplierId: supplierId ?? undefined,
      search:     search     || undefined,
      dateFrom,
      dateTo,
    }).subscribe({
      next: paged => {
        this.purchases.set(paged.items);
        this.totalCount.set(paged.totalCount);
        callback?.();
      },
      error: e => callback?.(e),
    });
  }

  private refreshSummary(callback?: (err?: unknown) => void): void {
    this.svc.getPurchaseSummary().subscribe({
      next: s => {
        this.summary.set(s);
        callback?.();
      },
      error: e => callback?.(e),
    });
  }

  // ── Filter handlers ───────────────────────────────────────────

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.searchSubject.next(value);
  }

  onFilterChange(): void {
    this.currentPage.set(1);
    this.loadPurchases();
  }

  onDateFilterChange(mode: DateFilterMode): void {
    this.dateFilter.set(mode);
    if (mode !== 'custom') { this.dateFrom.set(''); this.dateTo.set(''); }
    this.currentPage.set(1);
    this.loadPurchases();
  }

  // ── Pagination ────────────────────────────────────────────────

  goToPage(p: number): void {
    if (p >= 1 && p <= this.totalPages()) {
      this.currentPage.set(p);
      this.loadPurchases();
    }
  }

  // ── trackBy ───────────────────────────────────────────────────
  trackByPurchaseId(_: number, p: Purchase): number { return p.id; }
  trackBySupplierId(_: number, s: Supplier): number { return s.id; }
  trackByProductId(_: number, p: Product):  number  { return p.id; }

  // ── Form ──────────────────────────────────────────────────────

  openForm(): void {
    this.editingPurchase.set(null);
    this.formSupplier.set(null);
    this.supplierSearch.set('');
    this.formRows.set([this.blankRow()]);
    this.formPayStatus.set('Paid');
    this.formPaid.set(0);
    this.formNotes.set('');
    this.showForm.set(true);
  }

  startEdit(p: Purchase, e: Event): void {
    e.stopPropagation();
    this.editingPurchase.set(p);
    const supplier = this.suppliers().find(s => s.id === p.supplierId);
    this.formSupplier.set(supplier ?? null);
    this.supplierSearch.set(p.supplierName);
    this.formRows.set(p.items.map(i => ({ ...i })));
    this.formPayStatus.set(p.paymentStatus);
    this.formPaid.set(p.paidAmount);
    this.formNotes.set(p.notes || '');
    this.showForm.set(true);
  }

  closeForm(): void { this.showForm.set(false); this.editingPurchase.set(null); }

  blankRow(): BillRow {
    const first = this.products()[0];
    if (!first) return { productId: 0, productName: '', quantity: 1, pricePerUnit: 0, total: 0 };
    return {
      productId:    first.id,
      productName:  first.name,
      quantity:     1,
      pricePerUnit: first.purchasePrice,
      total:        first.purchasePrice,
    };
  }

  selectSupplier(s: Supplier): void {
    this.formSupplier.set(s);
    this.supplierSearch.set(s.name);
    this.showSupDrop.set(false);
  }
  clearSupplier(): void { this.formSupplier.set(null); this.supplierSearch.set(''); }
  hideSupDrop():   void { setTimeout(() => this.showSupDrop.set(false), 200); }

  addRow():             void { this.formRows.update(r => [...r, this.blankRow()]); }
  removeRow(i: number): void { this.formRows.update(r => r.filter((_, idx) => idx !== i)); }

  onProductChange(i: number, pid: number): void {
    const p = this.products().find(x => x.id === +pid);
    if (!p) return;
    this.formRows.update(rows => rows.map((r, idx) =>
      idx === i
        ? { ...r, productId: p.id, productName: p.name, pricePerUnit: p.purchasePrice, total: p.purchasePrice * r.quantity }
        : r
    ));
  }

  onQtyChange(i: number, q: number): void {
    const qty = Math.max(1, q || 1);
    this.formRows.update(rows => rows.map((r, idx) =>
      idx === i ? { ...r, quantity: qty, total: r.pricePerUnit * qty } : r
    ));
  }

  onPriceChange(i: number, price: number): void {
    const p = Math.max(0, price || 0);
    this.formRows.update(rows => rows.map((r, idx) =>
      idx === i ? { ...r, pricePerUnit: p, total: p * r.quantity } : r
    ));
  }

  adjQty(i: number, d: number): void {
    const r = this.formRows()[i]; if (r) this.onQtyChange(i, r.quantity + d);
  }

  onPayStatusChange(v: PurchaseStatus): void {
    this.formPayStatus.set(v);
    this.formPaid.set(v === 'Paid' ? this.formGrandTotal() : 0);
  }

  setFullAmount(): void { this.formPaid.set(this.formGrandTotal()); }

  submitPurchase(): void {
    const sup = this.formSupplier();
    if (!sup)                         { this.toast('Select a supplier.', 'error'); return; }
    if (this.formRows().length === 0) { this.toast('Add at least one item.', 'error'); return; }
    if (this.formGrandTotal() === 0)  { this.toast('Total cannot be zero.', 'error'); return; }
    if (this.formRows().some(r => r.productId === 0)) {
      this.toast('Please select a product for every row.', 'error'); return;
    }

    const grandTotal    = this.formGrandTotal();
    const paid          = this.formPaid();
    const balanceAmt    = Math.max(0, grandTotal - paid);
    const paymentStatus: PurchaseStatus = paid >= grandTotal ? 'Paid' : 'Credit';

    this.isSaving.set(true);
    const editing = this.editingPurchase();

    const data = {
      supplierId:    sup.id,
      supplierName:  sup.name,
      items:         this.formRows().map(r => ({ ...r }) as PurchaseItem),
      grandTotal,
      paidAmount:    paid,
      balance:       balanceAmt,
      paymentStatus,
      notes:         this.formNotes() || undefined,
    };

    const op = editing
      ? this.svc.updatePurchase(editing.id, data)
      : this.svc.createPurchase(data as Omit<Purchase, 'id' | 'createdAt'>);

    op.subscribe({
      next: () => {
        // Reload current page so list reflects changes
        this.currentPage.set(1);
        this.loadPurchases();
        this.refreshSummary();
        this.toast(
          editing
            ? `Purchase #${editing.id} updated successfully.`
            : 'Purchase recorded successfully.',
          'success'
        );
        this.isSaving.set(false);
        this.closeForm();
      },
      error: (err: Error) => {
        this.toast(err.message || 'Failed to save. Please try again.', 'error');
        this.isSaving.set(false);
      },
    });
  }

  markPaid(p: Purchase, e: Event): void {
    e.stopPropagation();
    this.svc.markPurchasePaid(p.id).subscribe({
      next: () => {
        this.loadPurchases();
        this.refreshSummary();
        this.toast(`Purchase #${p.id} marked as Paid.`, 'success');
      },
      error: (err: Error) => {
        this.toast(err.message || 'Failed to mark as paid.', 'error');
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────

  toast(msg: string, type: 'success' | 'error'): void {
    this.toastMsg.set(msg); this.toastType.set(type);
    setTimeout(() => this.toastMsg.set(''), 3000);
  }

  private todayStr(): string {
    const d  = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  private daysAgoStr(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  timeAgo(d: Date): string {
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    return days === 1 ? 'Yesterday' : `${days}d ago`;
  }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  avatarColor(id: number): string {
    return ['#0057FF','#00C17B','#F59E0B','#8B5CF6','#EC4899','#06B6D4'][id % 6];
  }

  fmtDate(d: Date): string {
    return new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
}