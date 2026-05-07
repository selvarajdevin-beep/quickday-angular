import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { SharedStateService, Supplier, Purchase } from '../../services/shared-state.service';

interface SupplierForm {
  name?:          string;
  phone?:         string;
  email?:         string;
  address?:       string;
  gstin?:         string;
  contactPerson?: string;
  notes?:         string;
  active?:        boolean;
}

@Component({
  selector:    'app-suppliers',
  standalone:  true,
  imports:     [CommonModule, FormsModule],
  templateUrl: './suppliers.component.html',
  styleUrls:   ['./suppliers.component.css'],
})
export class SuppliersComponent implements OnInit {

  // ── State ─────────────────────────────────────────────────────
  suppliers  = signal<Supplier[]>([]);
  isLoading  = signal(true);
  isSaving   = signal(false);

  // ── Server-driven pagination ──────────────────────────────────
  totalCount  = signal(0);
  currentPage = signal(1);
  readonly PAGE_SIZE = 10;

  totalPages  = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.PAGE_SIZE)));
  pageNumbers = computed(() => {
    const total = this.totalPages(), cur = this.currentPage();
    const pages: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) pages.push(i);
    return pages;
  });
  pageStart = computed(() =>
    this.totalCount() === 0 ? 0 : (this.currentPage() - 1) * this.PAGE_SIZE + 1
  );
  pageEnd = computed(() =>
    Math.min(this.currentPage() * this.PAGE_SIZE, this.totalCount())
  );

  // ── Filters ───────────────────────────────────────────────────
  searchQuery  = signal('');
  filterStatus = signal<'all' | 'active' | 'inactive'>('all');

  private searchSubject = new Subject<string>();

  // ── Summary KPIs — server-authoritative (from summary endpoint) ──
  totalDue         = signal(0);
  suppliersWithDue = signal(0);
  activeCount      = signal(0);

  // ── Modal ─────────────────────────────────────────────────────
  showModal       = signal(false);
  editingSupplier = signal<Supplier | null>(null);
  formData: SupplierForm = {};

  // ── Drawer ────────────────────────────────────────────────────
  showDrawer      = signal(false);
  drawerSupplier  = signal<Supplier | null>(null);
  drawerPurchases = signal<Purchase[]>([]);
  drawerLoading   = signal(false);

  // ── Pay modal ─────────────────────────────────────────────────
  showPayModal = signal(false);
  paySupplier  = signal<Supplier | null>(null);
  payAmount    = signal(0);
  isPaySaving  = signal(false);

  // ── Toast ─────────────────────────────────────────────────────
  toastMsg  = signal('');
  toastType = signal<'success' | 'error'>('success');

  readonly Math = Math;

  // pagedSuppliers is now just suppliers() — server already paged
  pagedSuppliers = computed(() => this.suppliers());

  // Drawer supplier kept live from current page
  drawerSupplierLive = computed(() => {
    const id = this.drawerSupplier()?.id;
    if (!id) return null;
    return this.suppliers().find(s => s.id === id) ?? this.drawerSupplier();
  });

  constructor(private svc: SharedStateService) {}

  // ── Init ──────────────────────────────────────────────────────
  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
    ).subscribe(() => {
      this.currentPage.set(1);
      this.loadSuppliers();
    });

    this.loadAll();
  }

  loadAll(): void {
    this.isLoading.set(true);
    let done = 0;
    const fin = (err?: unknown) => {
      if (err) this.toast('Failed to load suppliers.', 'error');
      if (++done === 1) this.isLoading.set(false);
    };
    this.loadSuppliers(fin);
  }

  loadSuppliers(callback?: (err?: unknown) => void): void {
    const status = this.filterStatus();

    this.svc.getSuppliers({
      page:     this.currentPage(),
      pageSize: this.PAGE_SIZE,
      search:   this.searchQuery().trim() || undefined,
      status:   status === 'all' ? undefined : status,
    }).subscribe({
      next: paged => {
        this.suppliers.set(paged.items);
        this.totalCount.set(paged.totalCount);
        // Recompute KPIs from current page + totalCount
        // For accurate KPIs across all pages, derive from full signal
        this.recomputeKpis(paged.items);
        callback?.();
      },
      error: e => callback?.(e),
    });
  }

  private recomputeKpis(items: Supplier[]): void {
    // These are page-level approximations — for full accuracy
    // a dedicated summary endpoint can be added later
    this.totalDue.set(items.reduce((s, x) => s + x.amountDue, 0));
    this.suppliersWithDue.set(items.filter(s => s.amountDue > 0).length);
    this.activeCount.set(items.filter(s => s.active).length);
  }

  // ── trackBy ───────────────────────────────────────────────────
  trackById(_: number, s: Supplier): number { return s.id; }

  // ── Filters ───────────────────────────────────────────────────
  onSearchChange(val: string): void {
    this.searchQuery.set(val);
    this.searchSubject.next(val);
  }

  onFilterChange(val: 'all' | 'active' | 'inactive'): void {
    this.filterStatus.set(val);
    this.currentPage.set(1);
    this.loadSuppliers();
  }

  goToPage(p: number): void {
    if (p >= 1 && p <= this.totalPages()) {
      this.currentPage.set(p);
      this.loadSuppliers();
    }
  }

  // ── Add / Edit Modal ──────────────────────────────────────────
  openAdd(): void {
    this.editingSupplier.set(null);
    this.formData = { active: true };
    this.showModal.set(true);
  }

  openEdit(s: Supplier, e: Event): void {
    e.stopPropagation();
    this.editingSupplier.set(s);
    this.formData = {
      name:          s.name,
      phone:         s.phone,
      email:         (s as any).email         ?? '',
      address:       s.address                ?? '',
      gstin:         (s as any).gstin         ?? '',
      contactPerson: (s as any).contactPerson ?? '',
      notes:         (s as any).notes         ?? '',
      active:        s.active,
    };
    this.showModal.set(true);
  }

  closeModal(): void { this.showModal.set(false); }

  save(): void {
    if (!this.formData.name?.trim() || !this.formData.phone?.trim()) {
      this.toast('Name and phone are required.', 'error'); return;
    }
    this.isSaving.set(true);
    const editing = this.editingSupplier();

    const op = editing
      ? this.svc.updateSupplier(editing.id, this.formData as any)
      : this.svc.createSupplier(this.formData as any);

    op.subscribe({
      next: () => {
        this.currentPage.set(editing ? this.currentPage() : 1);
        this.loadSuppliers();
        this.toast(editing ? 'Supplier updated.' : 'Supplier added.', 'success');
        this.closeModal();
        this.isSaving.set(false);
      },
      error: (err: Error) => {
        this.toast(err.message || 'Save failed.', 'error');
        this.isSaving.set(false);
      },
    });
  }

  toggleStatus(s: Supplier, e: Event): void {
    e.stopPropagation();
    this.svc.toggleSupplierStatus(s.id).subscribe({
      next: () => {
        this.loadSuppliers();
        this.toast(`${s.name} ${s.active ? 'deactivated' : 'activated'}.`, 'success');
      },
      error: (err: Error) => {
        this.toast(err.message || 'Failed to update status.', 'error');
      },
    });
  }

  // ── Drawer ────────────────────────────────────────────────────
  openDrawer(s: Supplier): void {
    this.drawerSupplier.set(s);
    this.showDrawer.set(true);
    this.loadDrawerPurchases(s.id);
  }

  private loadDrawerPurchases(supplierId: number): void {
    this.drawerLoading.set(true);
    this.svc.getPurchasesBySupplier(supplierId).subscribe({
      next:  d  => { this.drawerPurchases.set(d); this.drawerLoading.set(false); },
      error: () => this.drawerLoading.set(false),
    });
  }

  closeDrawer(): void { this.showDrawer.set(false); }

  // ── Pay modal ─────────────────────────────────────────────────
  openPay(s: Supplier, e: Event): void {
    e.stopPropagation();
    this.paySupplier.set(s);
    this.payAmount.set(s.amountDue);
    this.showPayModal.set(true);
  }

  closePay(): void { this.showPayModal.set(false); }

  confirmPay(): void {
    const s = this.paySupplier();
    if (!s || this.payAmount() <= 0) {
      this.toast('Enter a valid amount.', 'error'); return;
    }
    const amount = this.payAmount();
    this.isPaySaving.set(true);

    this.svc.recordSupplierPayment(s.id, amount).subscribe({
      next: () => {
        this.loadSuppliers();
        this.loadDrawerPurchases(s.id);
        this.toast(`₹${amount.toLocaleString('en-IN')} paid to ${s.name}.`, 'success');
        this.closePay();
        this.isPaySaving.set(false);
      },
      error: (err: Error) => {
        this.toast(err.message || 'Payment failed.', 'error');
        this.isPaySaving.set(false);
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────
  toast(msg: string, type: 'success' | 'error'): void {
    this.toastMsg.set(msg); this.toastType.set(type);
    setTimeout(() => this.toastMsg.set(''), 3000);
  }

  timeAgo(d: Date | null | undefined): string {
    if (!d) return 'Never';
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
    return ['#0057FF','#00C17B','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#EF4444'][id % 7];
  }
}