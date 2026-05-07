// customer-history-modal.component.ts
import {
  Component, Input, Output, EventEmitter,
  OnChanges, SimpleChanges,
} from '@angular/core';
import { CommonModule }       from '@angular/common';
import { FormsModule }        from '@angular/forms';
import {
  Customer, CustomerType, Order,
} from '../../services/shared-state.service';
import { SharedStateService } from '../../services/shared-state.service';
import { OrderHistorySummary } from '../../models/order.models';

declare const XLSX: any;

@Component({
  selector:    'app-customer-history-modal',
  standalone:  true,
  imports:     [CommonModule, FormsModule],
  templateUrl: './customer-history-modal.component.html',
  styleUrls:   ['./customer-history-modal.component.css'],
})
export class CustomerHistoryModalComponent implements OnChanges {

  readonly Math = Math;

  @Input()  customer: Customer | null = null;
  @Input()  visible   = false;
  @Output() visibleChange = new EventEmitter<boolean>();

  // ── Filter state ──────────────────────────────────────────────────────────
  dateFrom     = '';
  dateTo       = '';
  searchText   = '';
  filterStatus = 'all';

  // Mobile: filter panel toggle (not used in current design but kept for safety)
  filtersExpanded = false;

  // ── Pagination ────────────────────────────────────────────────────────────
  currentPage = 1;
  pageSize    = 25;
  totalPages  = 1;
  totalCount  = 0;

  get visiblePages(): number[] {
    const range = 2;
    const start = Math.max(1, this.currentPage - range);
    const end   = Math.min(this.totalPages, this.currentPage + range);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  orders:     Order[] = [];
  isLoading   = false;
  isExporting = false;

  // ── Summary ───────────────────────────────────────────────────────────────
  summary: OrderHistorySummary = {
    totalOrders: 0, totalSales: 0, totalPaid: 0, totalDue: 0,
  };

  constructor(private shared: SharedStateService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.customer) {
      this.resetFilters(false);
      this.setDefaultDateRange();
      this.loadOrders();
      document.body.style.overflow = 'hidden';
    }
    if (changes['visible'] && !this.visible) {
      document.body.style.overflow = '';
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Returns true when any filter differs from the default state */
  hasActiveFilters(): boolean {
    const now  = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const to   = now.toISOString().split('T')[0];
    return (
      this.filterStatus !== 'all' ||
      !!this.searchText ||
      this.dateFrom !== from ||
      this.dateTo   !== to
    );
  }

  close(): void {
    document.body.style.overflow = '';
    this.visibleChange.emit(false);
  }

  onMaskClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('hist-mask')) this.close();
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.loadOrders();
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
    this.loadOrders();
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages) return;
    this.currentPage = p;
    this.loadOrders();
  }

  resetFilters(reload = true): void {
    this.searchText     = '';
    this.filterStatus   = 'all';
    this.filtersExpanded = false;
    this.setDefaultDateRange();
    this.currentPage    = 1;
    if (reload) this.loadOrders();
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  private loadOrders(): void {
    if (!this.customer) return;
    this.isLoading = true;

    this.shared.getOrdersByCustomerFiltered(
      this.customer.id,
      this.currentPage,
      this.pageSize,
      {
        dateFrom: this.dateFrom     || undefined,
        dateTo:   this.dateTo       || undefined,
        search:   this.searchText   || undefined,
        status:   this.filterStatus !== 'all' ? this.filterStatus : undefined,
      }
    ).subscribe({
      next: result => {
        this.orders     = result.items;
        this.totalPages = result.totalPages;
        this.totalCount = result.totalCount;
        this.summary    = result.summary;
        this.isLoading  = false;
      },
      error: () => { this.isLoading = false; },
    });
  }

  // ── Excel export ──────────────────────────────────────────────────────────

  exportExcel(): void {
    if (!this.customer || this.isExporting) return;
    this.isExporting = true;

    this.shared.getOrdersByCustomerFiltered(
      this.customer.id, 1, 9999,
      {
        dateFrom: this.dateFrom     || undefined,
        dateTo:   this.dateTo       || undefined,
        search:   this.searchText   || undefined,
        status:   this.filterStatus !== 'all' ? this.filterStatus : undefined,
      }
    ).subscribe({
      next: result => {
        const wb = XLSX.utils.book_new();

        const orderRows = result.items.map(o => ({
          'Order #':      o.id,
          'Date':         this.fmtDate(o.createdAt),
          'Items':        o.items.map(i => `${i.productName} ×${i.quantity}`).join(', '),
          'Grand Total':  o.grandTotal,
          'Paid':         o.paidAmount,
          'Balance':      o.balance,
          'Status':       o.status,
          'Payment Mode': o.paymentType,
        }));
        const ws1 = XLSX.utils.json_to_sheet(orderRows);
        ws1['!cols'] = [
          { wch: 10 }, { wch: 14 }, { wch: 42 }, { wch: 14 },
          { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
        ];
        XLSX.utils.book_append_sheet(wb, ws1, 'Orders');

        const s = result.summary;
        const summaryRows = [
          { Field: 'Customer Name',   Value: this.customer!.name },
          { Field: 'Phone',           Value: this.customer!.phone },
          { Field: 'Type',            Value: this.customer!.customerType },
          { Field: 'Date From',       Value: this.dateFrom || 'All time' },
          { Field: 'Date To',         Value: this.dateTo   || 'All time' },
          { Field: 'Status Filter',   Value: this.filterStatus === 'all' ? 'All' : this.filterStatus },
          { Field: '',                Value: '' },
          { Field: 'Total Orders',    Value: s.totalOrders },
          { Field: 'Total Sales (₹)', Value: s.totalSales },
          { Field: 'Total Paid (₹)',  Value: s.totalPaid },
          { Field: 'Outstanding Due', Value: s.totalDue },
          { Field: 'Exported At',     Value: new Date().toLocaleString('en-IN') },
        ];
        const ws2 = XLSX.utils.json_to_sheet(summaryRows);
        ws2['!cols'] = [{ wch: 20 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

        const safeName = this.customer!.name.replace(/[^a-zA-Z0-9]/g, '_');
        XLSX.writeFile(wb, `${safeName}_orders_${this.dateFrom || 'all'}_to_${this.dateTo || 'all'}.xlsx`);
        this.isExporting = false;
      },
      error: () => { this.isExporting = false; },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private setDefaultDateRange(): void {
    const now  = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    this.dateFrom = from.toISOString().split('T')[0];
    this.dateTo   = now.toISOString().split('T')[0];
  }

  fmtDate(d: Date | string): string {
    return new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  avatarColor(id: number): string {
    return ['#0057FF','#00C17B','#F59E0B','#8B5CF6','#EC4899','#06B6D4'][id % 6];
  }

  typeClass(type: CustomerType): string {
    return type === 'Hotel' ? 'type-hotel' : 'type-home';
  }

  trackById(_: number, o: Order): number { return o.id; }
}