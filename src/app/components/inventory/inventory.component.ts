import { Component, OnInit, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { SharedStateService, Product, InventoryLog } from '../../services/shared-state.service';

@Component({
  selector:    'app-inventory',
  standalone:  true,
  imports:     [CommonModule, FormsModule],
  templateUrl: './inventory.component.html',
  styleUrls:   ['./inventory.component.css'],
})
export class InventoryComponent implements OnInit {

  readonly Math = Math;

  isMobile = signal(window.innerWidth <= 768);
  @HostListener('window:resize')
  onResize(): void { this.isMobile.set(window.innerWidth <= 768); }

  isLoading     = signal(true);
  isAdjSaving   = signal(false);
  isAlertSaving = signal(false);
  activeTab     = signal<'stock' | 'log'>('stock');

  // ── Stock tab — server-driven ─────────────────────────────
  stockItems    = signal<Product[]>([]);
  stockTotal    = signal(0);   // total matching server count
  stockPage     = signal(1);
  readonly stockPageSize = 10;

  stockTotalPages = computed(() => Math.max(1, Math.ceil(this.stockTotal() / this.stockPageSize)));
  stockPages      = computed(() => Array.from({ length: this.stockTotalPages() }, (_, i) => i + 1));

  // ── Stock filters ─────────────────────────────────────────
  searchQuery    = signal('');
  filterLowStock = signal(false);
  sortCol        = signal<'name' | 'stock' | 'min'>('name');
  sortDir        = signal<'asc' | 'desc'>('asc');

  private stockSearchSubject = new Subject<string>();

  totalStockUnits = signal(0);
  lowStockCount   = signal(0);

  // ── Summary KPIs — computed from current page ─────────────
  // For full accuracy a summary endpoint can be added;
  // for now these reflect the filtered server results
  // totalStockUnits = computed(() =>
  //   this.stockItems().reduce((s, i) => s + i.currentStock, 0)
  // );
  // lowStockCount = computed(() =>
  //   this.stockItems().filter(i => i.currentStock <= i.minStockAlert).length
  // );

  // filteredInventory = current page items (client-side sort only)
  filteredInventory = computed(() => {
    const col = this.sortCol();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return [...this.stockItems()].sort((a, b) => {
      if (col === 'name')  return a.name.localeCompare(b.name) * dir;
      if (col === 'stock') return (a.currentStock - b.currentStock) * dir;
      if (col === 'min')   return (a.minStockAlert - b.minStockAlert) * dir;
      return 0;
    });
  });

  // ── Log tab — server-driven ───────────────────────────────
  logItems      = signal<InventoryLog[]>([]);
  logTotal      = signal(0);
  logPage       = signal(1);
  readonly logPageSize = 10;

  logTotalPages = computed(() => Math.max(1, Math.ceil(this.logTotal() / this.logPageSize)));
  logPages      = computed(() => Array.from({ length: this.logTotalPages() }, (_, i) => i + 1));

  logDateFilter = signal<'today' | 'week' | 'custom'>('week');
  logFrom       = signal(this.daysAgo(7));
  logTo         = signal(this.today());
  logSearch     = signal('');

  private logSearchSubject = new Subject<string>();

  // ── Adjust modal ──────────────────────────────────────────
  showAdjustModal = signal(false);
  selectedItem    = signal<Product | null>(null);
  adjustType      = signal<'IN' | 'OUT'>('IN');
  adjustQty       = signal(0);
  adjustReason    = signal('');

  // ── Alert threshold modal ─────────────────────────────────
  showAlertModal   = signal(false);
  editingAlertItem = signal<Product | null>(null);
  newMinStock      = signal(0);

  // ── Toast ─────────────────────────────────────────────────
  toastMsg  = signal('');
  toastType = signal<'success' | 'error' | 'warning'>('success');

  constructor(private shared: SharedStateService) {}

  // ── Init ──────────────────────────────────────────────────
  ngOnInit(): void {
    // Stock search debounce
    this.stockSearchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
    ).subscribe(() => {
      this.stockPage.set(1);
      this.loadStock();
    });

    // Log search debounce
    this.logSearchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
    ).subscribe(() => {
      this.logPage.set(1);
      this.loadLogs();
    });

    this.isLoading.set(true);
    let done = 0;
    const fin = (err?: unknown) => {
      if (err) this.toast('Failed to load data. Please refresh.', 'error');
      if (++done === 2) this.isLoading.set(false);
    };

    this.loadStock(fin);
    this.loadLogs(fin);
  }

  // ── Stock loading ─────────────────────────────────────────
  loadStock(callback?: (err?: unknown) => void): void {
    this.shared.getProducts({
      page:       this.stockPage(),
      pageSize:   this.stockPageSize,
      search:     this.searchQuery().trim() || undefined,
      activeOnly: true,
      lowStockOnly: this.filterLowStock() || undefined
      // Note: filterLowStock handled client-side after load
      // since the SP doesn't have a lowStock filter param yet
    }).subscribe({
      next: paged => {
        this.stockItems.set(paged.items);
        this.stockTotal.set(paged.totalCount);

          this.totalStockUnits.set(paged.totalStockUnits ?? 0);
          this.lowStockCount.set(paged.lowStockCount ?? 0);
        callback?.();
      },
      error: e => callback?.(e),
    });
  }

  // ── Log loading ───────────────────────────────────────────
  loadLogs(callback?: (err?: unknown) => void): void {
    this.shared.getInventoryLogs(
      this.logFrom(),
      this.logTo(),
      this.logSearch().trim() || undefined,
      this.logPage(),
      this.logPageSize,
    ).subscribe({
      next: paged => {
        this.logItems.set(paged.items);
        this.logTotal.set(paged.totalCount);
        callback?.();
      },
      error: e => {
        this.toast('Failed to load logs.', 'error');
        callback?.(e);
      },
    });
  }

  // ── TrackBy ───────────────────────────────────────────────
  trackByProductId(_: number, item: Product): number   { return item.id; }
  trackByLogId(_: number, log: InventoryLog): number   { return +log.id; }

  // ── Sorting (client-side within current page) ─────────────
  toggleSort(col: 'name' | 'stock' | 'min'): void {
    if (this.sortCol() === col)
      this.sortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    else { this.sortCol.set(col); this.sortDir.set('asc'); }
  }

  // ── Stock filters ─────────────────────────────────────────
  onStockSearch(val: string): void {
    this.searchQuery.set(val);
    this.stockSearchSubject.next(val);
  }

  onLowStockToggle(): void {
    this.filterLowStock.update(v => !v);
    this.stockPage.set(1);
    this.loadStock();
  }

  goStockPage(p: number): void {
    if (p >= 1 && p <= this.stockTotalPages()) {
      this.stockPage.set(p);
      this.loadStock();
    }
  }

  // ── Log filters ───────────────────────────────────────────
  onLogSearch(val: string): void {
    this.logSearch.set(val);
    this.logSearchSubject.next(val);
  }

  setLogDateFilter(f: 'today' | 'week'): void {
    this.logDateFilter.set(f);
    this.logPage.set(1);
    if (f === 'today') { this.logFrom.set(this.today()); this.logTo.set(this.today()); }
    if (f === 'week')  { this.logFrom.set(this.daysAgo(7)); this.logTo.set(this.today()); }
    this.loadLogs();
  }

  applyLogDateRange(): void {
    this.logDateFilter.set('custom');
    this.logPage.set(1);
    this.loadLogs();
  }

  goLogPage(p: number): void {
    if (p >= 1 && p <= this.logTotalPages()) {
      this.logPage.set(p);
      this.loadLogs();
    }
  }

  // ── Adjust stock modal ────────────────────────────────────
  openAdjustModal(item: Product, type: 'IN' | 'OUT'): void {
    this.selectedItem.set(item);
    this.adjustType.set(type);
    this.adjustQty.set(0);
    this.adjustReason.set('');
    this.showAdjustModal.set(true);
  }

  closeAdjustModal(): void { this.showAdjustModal.set(false); }

  saveAdjustment(): void {
    const item = this.selectedItem();
    const qty  = this.adjustQty();
    const type = this.adjustType();

    if (!item)                         { this.toast('No product selected.', 'error'); return; }
    if (!qty || qty <= 0)              { this.toast('Enter a valid quantity.', 'error'); return; }
    if (!this.adjustReason().trim())   { this.toast('Please enter a reason.', 'error'); return; }
    if (type === 'OUT' && qty > item.currentStock) {
      this.toast(`Cannot remove ${qty} units. Current stock is only ${item.currentStock}.`, 'error');
      return;
    }

    this.isAdjSaving.set(true);

    this.shared.adjustStock(item.id, qty, type, this.adjustReason().trim()).subscribe({
      next: () => {
        // Reload current page to reflect updated stock
        this.loadStock();
        // Reload log page 1 so new entry appears
        this.logPage.set(1);
        this.loadLogs();
        this.toast(`Stock ${type === 'IN' ? 'added' : 'removed'} successfully.`, 'success');
        this.closeAdjustModal();
        this.isAdjSaving.set(false);
      },
      error: (err: Error) => {
        this.toast(err.message || 'Failed to adjust stock.', 'error');
        this.isAdjSaving.set(false);
      },
    });
  }

  // ── Alert threshold modal ─────────────────────────────────
  openAlertModal(item: Product): void {
    this.editingAlertItem.set(item);
    this.newMinStock.set(item.minStockAlert);
    this.showAlertModal.set(true);
  }

  saveAlertThreshold(): void {
    const item = this.editingAlertItem();
    if (!item) return;
    if (this.newMinStock() < 0) { this.toast('Threshold cannot be negative.', 'error'); return; }

    this.isAlertSaving.set(true);

    this.shared.updateMinStockAlert(item.id, this.newMinStock()).subscribe({
      next: () => {
        // Patch local signal so table updates immediately
        this.stockItems.update(list =>
          list.map(p => p.id === item.id
            ? { ...p, minStockAlert: this.newMinStock() }
            : p
          )
        );
        this.toast('Alert threshold updated.', 'success');
        this.showAlertModal.set(false);
        this.isAlertSaving.set(false);
        this.loadStock();
      },
      error: (err: Error) => {
        this.toast(err.message || 'Failed to update threshold.', 'error');
        this.isAlertSaving.set(false);
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────
  getStockStatus(item: Product): 'critical' | 'low' | 'good' {
    if (item.currentStock === 0)                 return 'critical';
    if (item.currentStock <= item.minStockAlert) return 'low';
    return 'good';
  }

  getStockPercent(item: Product): number {
    const max = Math.max(item.currentStock + 50, item.minStockAlert * 3, 100);
    return Math.min(100, Math.round((item.currentStock / max) * 100));
  }

  toast(msg: string, type: 'success' | 'error' | 'warning'): void {
    this.toastMsg.set(msg); this.toastType.set(type);
    setTimeout(() => this.toastMsg.set(''), 3000);
  }

  today(): string { return new Date().toISOString().slice(0, 10); }
  daysAgo(n: number): string {
    const d = new Date(); d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
  fmtDate(d: Date): string {
    return new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
}