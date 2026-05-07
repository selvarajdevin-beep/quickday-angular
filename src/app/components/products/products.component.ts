import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { SharedStateService, Product } from '../../services/shared-state.service';

@Component({
  selector:    'app-products',
  standalone:  true,
  imports:     [CommonModule, FormsModule],
  templateUrl: './products.component.html',
  styleUrls:   ['./products.component.css'],
})
export class ProductsComponent implements OnInit {

  // ── State ─────────────────────────────────────────────────────
  products     = signal<Product[]>([]);
  isLoading    = signal(true);
  isSaving     = signal(false);

  // ── Server-driven pagination ──────────────────────────────────
  totalCount   = signal(0);
  currentPage  = signal(1);
  readonly pageSize = 10;

  totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.pageSize)));
  pages      = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));

  // ── Filters ───────────────────────────────────────────────────
  searchQuery    = signal('');
  filterStatus   = signal<'all' | 'active' | 'inactive'>('all');
  filterCategory = signal<string>('All');

  private searchSubject = new Subject<string>();

  // ── Summary KPI counts — ALL server-authoritative ─────────────
  // These reflect the FULL dataset, not the current page
  summaryTotal    = signal(0);   // total products in DB
  activeCount     = signal(0);
  inactiveCount   = signal(0);
  lowStockCount   = signal(0);
  categoryCount   = signal(0);   // fixed from server, not dynamic

  // ── Form panel ────────────────────────────────────────────────
  showModal      = signal(false);
  editingProduct = signal<Product | null>(null);
  form: Partial<Product> = {};

  // ── Toast ─────────────────────────────────────────────────────
  toastMsg  = signal('');
  toastType = signal<'success' | 'error'>('success');

  // ── Shop-type-driven dropdown lists ───────────────────────────
  private svc = inject(SharedStateService);
  unitTypes   = this.svc.shopUnitTypes;
  categories  = this.svc.shopCategories;

  // ── Computed ──────────────────────────────────────────────────
  usedCategories = computed(() => {
    const merged = new Set<string>(this.categories());
    this.products().forEach(p => { if (p.category) merged.add(p.category); });
    return ['All', ...Array.from(merged)];
  });

  pagedProducts = computed(() => this.products());

  categoryCount_map = computed(() => {
    const map = new Map<string, number>();
    map.set('All', this.totalCount());
    for (const p of this.products()) {
      const c = p.category || 'Uncategorized';
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return map;
  });

  // ── Lifecycle ─────────────────────────────────────────────────

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
    ).subscribe(() => {
      this.currentPage.set(1);
      this.loadProducts();
    });

    this.loadAll();
  }

  loadAll(): void {
    this.isLoading.set(true);
    let done = 0;
    const fin = (err?: unknown) => {
      if (err) this.toast('Failed to load products. Please refresh.', 'error');
      if (++done === 2) this.isLoading.set(false);
    };

    this.loadProducts(fin);
    this.refreshSummary(fin);
  }

  loadProducts(callback?: (err?: unknown) => void): void {
    const status   = this.filterStatus();
    const category = this.filterCategory();
    const search   = this.searchQuery().trim();

    this.svc.getProducts({
      page:       this.currentPage(),
      pageSize:   this.pageSize,
      search:     search   || undefined,
      activeOnly: status === 'all'    ? undefined
                : status === 'active' ? true : false,
      category:   category === 'All' ? undefined : category,
    }).subscribe({
      next: paged => {
        this.products.set(paged.items);
        this.totalCount.set(paged.totalCount);
        callback?.();
      },
      error: e => callback?.(e),
    });
  }

  private refreshSummary(callback?: (err?: unknown) => void): void {
    this.svc.getProductSummary().subscribe({
      next: s => {
        this.summaryTotal.set(s.totalProducts);  // ← full DB count
        this.activeCount.set(s.activeCount);
        this.inactiveCount.set(s.inactiveCount);
        this.lowStockCount.set(s.lowStockCount);
        this.categoryCount.set(s.categoryCount); // ← fixed from server
        callback?.();
      },
      error: e => callback?.(e),
    });
  }

  // ── Filter & search handlers ──────────────────────────────────

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.searchSubject.next(value);
  }

  onFilterChange(): void {
    this.currentPage.set(1);
    this.loadProducts();
  }

  onCategoryFilter(cat: string): void {
    this.filterCategory.set(cat);
    this.currentPage.set(1);
    this.loadProducts();
  }

  // ── Pagination ────────────────────────────────────────────────

  goToPage(p: number): void {
    if (p >= 1 && p <= this.totalPages()) {
      this.currentPage.set(p);
      this.loadProducts();
    }
  }

  // ── Form ──────────────────────────────────────────────────────

  openAdd(): void {
    this.editingProduct.set(null);
    this.form = {
      unitType:      this.unitTypes()[0]  ?? 'Piece',
      category:      this.categories()[0] ?? '',
      active:        true,
      sellingPrice:  0,
      purchasePrice: 0,
      minStockAlert: 10,
    };
    this.showModal.set(true);
  }

  openEdit(p: Product): void {
    this.editingProduct.set(p);
    this.form = { ...p };
    this.showModal.set(true);
  }

  closeModal(): void { this.showModal.set(false); this.form = {}; }

  save(): void {
    if (!this.form.name?.trim()) {
      this.toast('Product name is required.', 'error'); return;
    }
    if (!this.form.unitType) {
      this.toast('Unit type is required.', 'error'); return;
    }

    this.isSaving.set(true);
    const editing = this.editingProduct();

    if (editing) {
      this.svc.updateProduct(editing.id, this.form).subscribe({
        next: updated => {
          this.products.update(list => list.map(p => p.id === updated.id ? updated : p));
          this.toast(`'${updated.name}' updated successfully.`, 'success');
          this.closeModal();
          this.isSaving.set(false);
          this.refreshSummary();
        },
        error: (err: Error) => {
          this.toast(err.message || 'Update failed. Please try again.', 'error');
          this.isSaving.set(false);
        },
      });
    } else {
      this.svc.createProduct(this.form).subscribe({
        next: created => {
          this.currentPage.set(1);
          this.loadProducts();
          this.toast(`'${created.name}' added successfully.`, 'success');
          this.closeModal();
          this.isSaving.set(false);
          this.refreshSummary();
        },
        error: (err: Error) => {
          this.toast(err.message || 'Save failed. Please try again.', 'error');
          this.isSaving.set(false);
        },
      });
    }
  }

  toggleStatus(p: Product): void {
    this.svc.toggleProductStatus(p.id).subscribe({
      next: updated => {
        this.products.update(list => list.map(x => x.id === updated.id ? updated : x));
        this.toast(
          `'${updated.name}' ${updated.active ? 'activated' : 'deactivated'}.`,
          'success'
        );
        this.refreshSummary();
      },
      error: (err: Error) => {
        this.toast(err.message || 'Failed to update status.', 'error');
      },
    });
  }

  // ── trackBy ───────────────────────────────────────────────────
  trackById(_: number, item: Product): number { return item.id; }
  trackByCat(_: number, cat: string): string  { return cat; }

  // ── Toast ─────────────────────────────────────────────────────
  toast(msg: string, type: 'success' | 'error'): void {
    this.toastMsg.set(msg);
    this.toastType.set(type);
    setTimeout(() => this.toastMsg.set(''), 3500);
  }
}