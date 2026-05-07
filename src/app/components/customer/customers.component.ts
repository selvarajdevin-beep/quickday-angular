// customers.component.ts
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  SharedStateService, Customer, CustomerType, Order, PaymentRecord,
} from '../../services/shared-state.service';
import { CustomerHistoryModalComponent } from './customer-history-modal.component';

@Component({
  selector:    'app-customers',
  standalone:  true,
  imports:     [CommonModule, FormsModule, CustomerHistoryModalComponent],
  templateUrl: './customers.component.html',
  styleUrls:   ['./customers.component.css'],
})
export class CustomersComponent implements OnInit {

  readonly Math = Math;

  isLoading = signal(true);
  isSaving  = signal(false);

  // ── Filters ───────────────────────────────────────────────
  searchQuery  = signal('');
  filterStatus = signal<'all' | 'active' | 'inactive'>('all');
  filterDue    = signal(false);
  filterType   = signal<'all' | CustomerType>('all');
  pageSize     = 10;
  currentPage  = signal(1);

  // ── Pagination metadata ───────────────────────────────────
  totalCount = signal(0);
  totalPages = signal(1);

  pagedCustomers = computed(() => this.shared.customers());

  pages = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1)
  );

  // ── KPI signals ───────────────────────────────────────────
  totalDueAmount   = signal(0);
  customersWithDue = signal(0);
  activeCount      = signal(0);
  hotelCount       = signal(0);
  homeCount        = signal(0);

  allCustomers      = computed(() => Array.from({ length: this.totalCount() }));
  filteredCustomers = computed(() => Array.from({ length: this.totalCount() }));

  // ── Add / Edit Modal ──────────────────────────────────────
  showModal       = signal(false);
  editingCustomer = signal<Customer | null>(null);
  formData: Partial<Customer> = {};

  // ── Drawer ────────────────────────────────────────────────
  showDrawer       = signal(false);
  drawerCustomerId = signal<number | null>(null);
  drawerView       = signal<'orders' | 'payments'>('orders');
  drawerLoading    = signal(false);

  drawerCustomer = computed(() => {
    const id = this.drawerCustomerId();
    if (!id) return null;
    return this.pagedCustomers().find(c => c.id === id) ?? null;
  });

  drawerOrdersList     = signal<Order[]>([]);
  drawerOrdersPage     = signal(1);
  drawerOrdersTotalPgs = signal(1);
  drawerOrders         = computed(() => this.drawerOrdersList());

  drawerPaymentsList     = signal<PaymentRecord[]>([]);
  drawerPaymentsPage     = signal(1);
  drawerPaymentsTotalPgs = signal(1);
  drawerPayments         = computed(() => this.drawerPaymentsList());

  // ── Payment Modal ─────────────────────────────────────────
  showPaymentModal = signal(false);
  paymentCustomer  = signal<Customer | null>(null);
  paymentOrderId   = signal<number | undefined>(undefined);
  paymentAmount    = signal(0);
  paymentType      = signal<'Cash' | 'UPI'>('Cash');
  paymentNote      = signal('');

  paymentModalDue = computed(() => {
    const orderId = this.paymentOrderId();
    if (orderId) {
      return this.drawerOrdersList().find(o => o.id === orderId)?.balance
        ?? this.paymentCustomer()?.totalDue
        ?? 0;
    }
    return this.paymentCustomer()?.totalDue ?? 0;
  });

  // ── History Modal ─────────────────────────────────────────
  historyCustomer  = signal<Customer | null>(null);
  showHistoryModal = signal(false);

  // ── Toast ─────────────────────────────────────────────────
  toastMsg  = signal('');
  toastType = signal<'success' | 'error'>('success');

  constructor(private shared: SharedStateService) {}

  ngOnInit(): void { this.loadCustomers(); }

  // ── Central load method ───────────────────────────────────
  loadCustomers(): void {
    this.isLoading.set(true);
    this.shared.getCustomers({
      page:     this.currentPage(),
      pageSize: this.pageSize,
      search:   this.searchQuery()  || undefined,
      status:   this.filterStatus() !== 'all' ? this.filterStatus() : undefined,
      type:     this.filterType()   !== 'all' ? this.filterType()   : undefined,
      hasDue:   this.filterDue()    || undefined,
    }).subscribe({
      next: result => {
        this.totalCount.set(result.totalCount);
        this.totalPages.set(result.totalPages);

        if (result.summary) {
          this.totalDueAmount.set(result.summary.totalDueAmount);
          this.customersWithDue.set(result.summary.customersWithDue);
          this.activeCount.set(result.summary.activeCount);
          this.hotelCount.set(result.summary.hotelCount);
          this.homeCount.set(result.summary.homeCount);
        }

        this.isLoading.set(false);
      },
      error: (err: Error) => {
        this.toast(err.message || 'Failed to load customers.', 'error');
        this.isLoading.set(false);
      },
    });
  }

  trackById(_index: number, item: Customer): number { return item.id; }

  // ── Add / Edit Modal ──────────────────────────────────────
  openAdd(): void {
    this.editingCustomer.set(null);
    this.formData = {
      active: true, customerType: 'Home',
      defaultPricePerCan: 35, defaultPriceProductId: 1, usePriceFromProduct: false,
    };
    this.showModal.set(true);
  }

  openEdit(c: Customer, e: Event): void {
    e.stopPropagation();
    this.editingCustomer.set(c);
    this.formData = { ...c };
    this.showModal.set(true);
  }

  closeModal(): void { this.showModal.set(false); }

  save(): void {
    if (!this.formData.name?.trim() || !this.formData.phone?.trim()) {
      this.toast('Name and phone are required.', 'error'); return;
    }
    this.isSaving.set(true);
    const editing = this.editingCustomer();

    if (editing) {
      this.shared.updateCustomer(editing.id, this.formData).subscribe({
        next: () => {
          this.toast('Customer updated successfully.', 'success');
          this.closeModal(); this.isSaving.set(false); this.loadCustomers();
        },
        error: (err: Error) => {
          this.toast(err.message || 'Failed to update customer.', 'error');
          this.isSaving.set(false);
        },
      });
    } else {
      this.shared.createCustomer(this.formData).subscribe({
        next: () => {
          this.toast('Customer added successfully.', 'success');
          this.closeModal(); this.isSaving.set(false); this.loadCustomers();
        },
        error: (err: Error) => {
          this.toast(err.message || 'Failed to save customer.', 'error');
          this.isSaving.set(false);
        },
      });
    }
  }

  toggleStatus(c: Customer, e: Event): void {
    e.stopPropagation();
    this.shared.toggleCustomerStatus(c.id).subscribe({
      next: u => {
        this.toast(`${c.name} ${u.active ? 'activated' : 'deactivated'} successfully.`, 'success');
        this.loadCustomers();
      },
      error: (err: Error) => this.toast(err.message || 'Failed to update status.', 'error'),
    });
  }

  // ── Drawer ────────────────────────────────────────────────
  openDrawer(c: Customer): void {
    this.drawerCustomerId.set(c.id);
    this.drawerOrdersPage.set(1);
    this.drawerPaymentsPage.set(1);
    this.drawerView.set('orders');
    this.showDrawer.set(true);
    this.fetchDrawerOrders(c.id, 1);
  }

  closeDrawer(): void {
    this.showDrawer.set(false);
    this.drawerCustomerId.set(null);
  }

  private fetchDrawerOrders(customerId: number, page = 1): void {
    this.drawerLoading.set(true);
    this.shared.getOrdersByCustomer(customerId, page, 5).subscribe({
      next: result => {
        this.drawerOrdersList.set(result.items);
        this.drawerOrdersTotalPgs.set(result.totalPages);
        this.drawerOrdersPage.set(result.page);
        this.drawerLoading.set(false);
      },
      error: () => this.drawerLoading.set(false),
    });
  }

  private fetchDrawerPayments(customerId: number, page = 1): void {
    this.drawerLoading.set(true);
    this.shared.getPaymentsByCustomer(customerId, page, 5).subscribe({
      next: result => {
        this.drawerPaymentsList.set(result.items);
        this.drawerPaymentsTotalPgs.set(result.totalPages);
        this.drawerPaymentsPage.set(result.page);
        this.drawerLoading.set(false);
      },
      error: () => this.drawerLoading.set(false),
    });
  }

  switchDrawerView(v: 'orders' | 'payments'): void {
    this.drawerView.set(v);
    const id = this.drawerCustomerId();
    if (!id) return;
    if (v === 'orders')   this.fetchDrawerOrders(id, this.drawerOrdersPage());
    if (v === 'payments') this.fetchDrawerPayments(id, this.drawerPaymentsPage());
  }

  drawerOrdersGoToPage(p: number): void {
    const id = this.drawerCustomerId();
    if (id && p >= 1 && p <= this.drawerOrdersTotalPgs())
      this.fetchDrawerOrders(id, p);
  }

  drawerPaymentsGoToPage(p: number): void {
    const id = this.drawerCustomerId();
    if (id && p >= 1 && p <= this.drawerPaymentsTotalPgs())
      this.fetchDrawerPayments(id, p);
  }

  // ── History Modal ─────────────────────────────────────────
  openHistory(c: Customer, e: Event): void {
    e.stopPropagation();
    this.historyCustomer.set(c);
    this.showHistoryModal.set(true);
  }

  // ── Collect Payment ───────────────────────────────────────
  openPaymentModal(c: Customer, e: Event, order?: Order): void {
    e.stopPropagation();
    this.paymentCustomer.set(c);
    this.paymentOrderId.set(order?.id);
    this.paymentAmount.set(order ? order.balance : c.totalDue);
    this.paymentType.set('Cash');
    this.paymentNote.set(order ? `Payment for order #${order.id}` : '');
    this.showPaymentModal.set(true);
  }

  closePaymentModal(): void { this.showPaymentModal.set(false); }

  savePayment(): void {
    const c = this.paymentCustomer();
    if (!c || this.paymentAmount() <= 0) {
      this.toast('Enter a valid amount.', 'error'); return;
    }
    this.shared.recordPayment(
      c.id, this.paymentAmount(), this.paymentType(),
      this.paymentNote() || `Payment from ${c.name}`,
      this.paymentOrderId()
    ).subscribe({
      next: () => {
        this.toast(`₹${this.paymentAmount()} collected from ${c.name}.`, 'success');
        this.closePaymentModal();
        const drawerId = this.drawerCustomerId();
        if (drawerId === c.id) {
          this.fetchDrawerOrders(drawerId, 1);
          this.fetchDrawerPayments(drawerId, 1);
        }
        this.loadCustomers();
      },
      error: (err: Error) => this.toast(err.message || 'Payment failed.', 'error'),
    });
  }

  // ── Pagination ────────────────────────────────────────────
  goToPage(p: number): void {
    if (p >= 1 && p <= this.totalPages()) {
      this.currentPage.set(p);
      this.loadCustomers();
    }
  }

  onFilter(): void { this.currentPage.set(1); this.loadCustomers(); }

  // ── Helpers ───────────────────────────────────────────────
  toast(msg: string, type: 'success' | 'error'): void {
    this.toastMsg.set(msg); this.toastType.set(type);
    setTimeout(() => this.toastMsg.set(''), 3000);
  }

  timeAgo(d: Date | null): string {
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
    return ['#0057FF','#00C17B','#F59E0B','#8B5CF6','#EC4899','#06B6D4'][id % 6];
  }

  fmtDate(d: Date): string {
    return new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  typeClass(type: CustomerType): string {
    return type === 'Hotel' ? 'type-hotel' : 'type-home';
  }
}