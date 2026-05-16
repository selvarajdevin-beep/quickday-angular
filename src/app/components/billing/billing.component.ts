import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  SharedStateService, Customer, Product, Order, OrderItem,
  PaymentType, OrderStatus, ShopType,
  PaymentRecord, BusinessSettings, computeGst
} from '../../services/shared-state.service';
import { AuthService } from '../../services/auth.service';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

interface BillItem {
  productId:    number;
  productName:  string;
  pricePerUnit: number;
  quantity:     number;
  total:        number;
}

type BillingView    = 'new-bill' | 'all-orders';
type DateFilterMode = 'all' | 'today' | 'week' | 'custom';

const BAKERY_CATEGORIES = ['All', 'Bread', 'Cakes', 'Pastries', 'Snacks', 'Drinks', 'Other'];

function inferBakeryCategory(productName: string): string {
  const n = productName.toLowerCase();
  if (n.includes('bread') || n.includes('bun') || n.includes('loaf') || n.includes('roll')) return 'Bread';
  if (n.includes('cake') || n.includes('muffin') || n.includes('cupcake'))                  return 'Cakes';
  if (n.includes('pastry') || n.includes('croissant') || n.includes('puff') || n.includes('eclair')) return 'Pastries';
  if (n.includes('cookie') || n.includes('biscuit') || n.includes('snack') || n.includes('chips'))   return 'Snacks';
  if (n.includes('juice') || n.includes('tea') || n.includes('coffee') || n.includes('milk') || n.includes('water')) return 'Drinks';
  return 'Other';
}

@Component({
  selector:    'app-billing',
  standalone:  true,
  imports:     [CommonModule, FormsModule],
  templateUrl: './billing.component.html',
  styleUrls:   ['./billing.component.css'],
})
export class BillingComponent implements OnInit {

  readonly Math = Math;
  shared: SharedStateService;
  currentUser = computed(() => this.auth.currentUser());

  activeView     = signal<BillingView>('new-bill');
  isLoading      = signal(true);
  isSavingOrder  = signal(false);
  mobileCartOpen = signal(false);

  customers = computed(() => this.svc.customers());
  products  = computed(() => this.svc.products());
  shopType  = computed<ShopType>(() => this.svc.shopType());
  isBakery  = computed(() => this.shopType() === 'Bakery');

  allOrders = computed(() => ({ length: this.ordersTotal() }));

  customerSearch       = signal('');
  showCustomerDropdown = signal(false);
  billItems            = signal<BillItem[]>([]);
  paymentType          = signal<PaymentType>('Cash');
  paidAmount           = signal(0);
  orderNote            = signal('');

  // ── Customer search ───────────────────────────────────────
  customerSearchResults = signal<Customer[]>([]);
  private customerSearch$ = new Subject<string>();

  // ── Product search ────────────────────────────────────────
  productSearchResults  = signal<Product[]>([]);
  private productSearch$ = new Subject<string>();
  bakeryProductSearch    = signal<string>('');

  isDeletingOrder  = signal(false);
  orderPayments    = signal<PaymentRecord[]>([]);
  loadingPayments  = signal(false);

  invoiceOrder   = signal<Order | null>(null);
  isSharingPdf   = signal(false);

  invoiceCustomer = computed<Customer | null>(() => {
    const order = this.invoiceOrder();
    if (!order || order.customerId === 0) return null;
    return this.customers().find(c => c.id === order.customerId) ?? null;
  });

  settings = computed(() => this.svc.settings());

  invoiceGst = computed(() => {
    const o = this.invoiceOrder();
    if (!o) return { cgst: 0, sgst: 0, igst: 0, totalGst: 0, grandTotal: 0, taxableAmount: 0, balance: 0 };
    if (o.gstType && o.gstType !== 'None' && o.totalGst > 0) {
      return {
        taxableAmount: o.taxableAmount,
        cgst:          o.cgstAmount,
        sgst:          o.sgstAmount,
        igst:          o.igstAmount,
        totalGst:      o.totalGst,
        grandTotal:    o.grandTotal,
        balance:       o.balance,
      };
    }
    return { cgst: 0, sgst: 0, igst: 0, totalGst: 0, grandTotal: o.grandTotal, taxableAmount: o.grandTotal, balance: o.balance };
  });

  itemsSubTotal = computed(() => this.billItems().reduce((s, i) => s + i.total, 0));

  liveGst = computed(() => {
    const s = this.settings();
    if (!s.gstEnabled || !s.showGstOnInvoice) return null;
    return computeGst(this.itemsSubTotal(), s as any);
  });

  grandTotal = computed(() => {
    const gst = this.liveGst();
    return gst ? gst.taxableAmount + gst.totalGst : this.itemsSubTotal();
  });

  private _selectedCustomerId = signal<number | null>(null);

  selectedCustomer = computed<Customer | null>(() => {
    const id = this._selectedCustomerId();
    if (id == null) return null;
    return this.customers().find(c => c.id === id) ?? null;
  });

  isWalkIn = computed(() => this._selectedCustomerId() == null);

  availablePaymentTypes = computed<PaymentType[]>(() =>
    this.isWalkIn() ? ['Cash', 'UPI'] : ['Cash', 'UPI', 'Credit']
  );

  editingOrder = signal<Order | null>(null);

  // ── Orders filter state ───────────────────────────────────
  ordersSearch     = signal('');
  ordersStatus     = signal<'all' | 'Paid' | 'Credit' | 'Partial'>('all');
  ordersPage       = signal(1);
  ordersPageSize   = 10;
  viewOrderDetail  = signal<Order | null>(null);
  ordersDateFilter = signal<DateFilterMode>('all');
  ordersDateFrom   = signal<string>('');
  ordersDateTo     = signal<string>('');

  ordersTotal   = signal(0);
  totalOrdPages = signal(1);

  // ── Debounced search Subject for orders search box ────────
  private ordersSearch$ = new Subject<string>();

  pagedOrders = computed(() => this.svc.orders());

  ordPagesArr = computed(() => {
    const total = this.totalOrdPages();
    const cur   = this.ordersPage();
    const nums: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) nums.push(i);
    return nums;
  });

  recentOrders = computed(() =>
    [...this.svc.orders()]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
  );

  filteredCustomers = computed(() => this.customerSearchResults());

  activeProducts = computed(() => {
    const results = this.productSearchResults();
    if (results.length > 0) return results;
    return this.products().filter(p => p.active);
  });

  balance  = computed(() =>
    this.paymentType() === 'Credit'
      ? this.grandTotal()
      : Math.max(0, this.grandTotal() - this.paidAmount())
  );
  isCredit = computed(() => this.paymentType() === 'Credit');

  toastMsg  = signal('');
  toastType = signal<'success' | 'error'>('success');

  bakeryCategory   = signal<string>('All');
  bakeryCategories = BAKERY_CATEGORIES;

  bakeryProducts = computed(() =>
    this.productSearchResults().map(p => ({
      ...p,
      category: inferBakeryCategory(p.name),
    }))
  );

  bakeryFilteredProducts = computed(() => {
    let list = this.bakeryProducts();
    const cat = this.bakeryCategory();
    if (cat !== 'All') list = list.filter(p => p.category === cat);
    const q = this.bakeryProductSearch().toLowerCase().trim();
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));
    return list;
  });

  cartQty(productId: number): number {
    return this.billItems().find(i => i.productId === productId)?.quantity ?? 0;
  }

  todaySummary = computed(() => this.svc.todaySummary());

  constructor(private svc: SharedStateService, private auth: AuthService) {
    this.shared = svc;
  }

  ngOnInit(): void {
    this.isLoading.set(true);
    let done = 0;
    const fin = (err?: any) => {
      if (err) this.toast('Failed to load data. Please refresh.', 'error');
      if (++done === 2) this.isLoading.set(false);
    };

    this.svc.getCustomers().subscribe({ next: () => fin(), error: e => fin(e) });
    this.loadOrders(() => fin());
    this.svc.getTodaySummary().subscribe();

    // ── Customer debounced search ──────────────────────────
    this.customerSearch$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
    ).subscribe(query => {
      this.svc.getCustomers({
        search:   query || undefined,
        status:   'active',
        page:     1,
        pageSize: 20,
      }).subscribe({
        next:  result => this.customerSearchResults.set(result.items),
        error: ()     => this.customerSearchResults.set([]),
      });
    });
    this.customerSearch$.next('');

    // ── Product debounced search ───────────────────────────
    this.productSearch$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
    ).subscribe(query => {
      this.svc.getProducts({
        search:     query || undefined,
        activeOnly: true,
        page:       1,
        pageSize:   200,
      }).subscribe({
        next:  result => this.productSearchResults.set(result.items),
        error: ()     => this.productSearchResults.set([]),
      });
    });
    this.productSearch$.next('');

    // ── Orders search box — debounced 400ms ───────────────
    this.ordersSearch$.pipe(
      debounceTime(400),
      distinctUntilChanged(),
    ).subscribe(() => {
      this.ordersPage.set(1);
      this.loadOrders();
    });
  }

  // ══════════════════════════════════════════════════════════
  // loadOrders
  // ══════════════════════════════════════════════════════════
  loadOrders(callback?: () => void): void {
    const df = this.ordersDateFilter();
    let from: string | undefined;
    let to:   string | undefined;

    if      (df === 'today')  { from = to = this.todayStr(); }
    else if (df === 'week')   { from = this.daysAgoStr(7); to = this.todayStr(); }
    else if (df === 'custom') { from = this.ordersDateFrom() || undefined; to = this.ordersDateTo() || undefined; }

    const status = this.ordersStatus();
    const search = this.ordersSearch().trim() || undefined;

    this.svc.getOrders({
      from,
      to,
      status: status !== 'all' ? status : undefined,
      search,
      page:     this.ordersPage(),
      pageSize: this.ordersPageSize,
    }).subscribe({
      next: result => {
        this.ordersTotal.set(result.totalCount);
        this.totalOrdPages.set(result.totalPages);
        callback?.();
      },
      error: (err: Error) => {
        this.toast(err.message || 'Failed to load orders.', 'error');
        callback?.();
      },
    });
  }

  onStatusFilter(status: 'all' | 'Paid' | 'Credit' | 'Partial'): void {
    this.ordersStatus.set(status);
    this.ordersPage.set(1);
    this.loadOrders();
  }

  onSearchInput(value: string): void {
    this.ordersSearch.set(value);
    this.ordersSearch$.next(value);
  }

  onDateFilterChange(mode: DateFilterMode): void {
    this.ordersDateFilter.set(mode);
    if (mode !== 'custom') { this.ordersDateFrom.set(''); this.ordersDateTo.set(''); }
    this.ordersPage.set(1);
    this.loadOrders();
  }

  onOrderFilter(): void {
    this.ordersPage.set(1);
    this.loadOrders();
  }

  onProductRowSearch(query: string): void {
    this.productSearch$.next(query);
  }

  onBakerySearchChange(query: string): void {
    this.bakeryProductSearch.set(query);
    this.productSearch$.next(query);
  }

  trackByOrder(_: number, o: Order): number       { return o.id; }
  trackByCustomer(_: number, c: Customer): number { return c.id; }
  trackByProduct(_: number, p: Product): number   { return p.id; }
  trackByNumber(_: number, n: number): number     { return n; }
  trackByString(_: number, s: string): string     { return s; }
  trackByIndex(index: number): number             { return index; }

  onCustomerInput(): void {
    this.showCustomerDropdown.set(true);
    this._selectedCustomerId.set(null);
    this.customerSearch$.next(this.customerSearch());
  }

  selectCustomer(c: Customer): void {
    this._selectedCustomerId.set(c.id);
    this.customerSearch.set(c.name);
    this.showCustomerDropdown.set(false);
    if (!this.isBakery() && this.billItems().length === 0) {
      const firstProduct = this.activeProducts()[0];
      if (firstProduct) {
        const price = this.svc.getEffectivePrice(firstProduct, c);
        this.billItems.set([{
          productId:    firstProduct.id,
          productName:  firstProduct.name,
          pricePerUnit: price,
          quantity:     1,
          total:        price,
        }]);
      }
    }
  }

  clearCustomer(): void {
    this._selectedCustomerId.set(null);
    this.customerSearch.set('');
    if (!this.isBakery()) this.billItems.set([]);
    this.paidAmount.set(0);
    this.paymentType.set('Cash');
  }

  hideDropdown(): void { setTimeout(() => this.showCustomerDropdown.set(false), 200); }

  bakeryTapProduct(product: Product): void {
    const existing = this.billItems().find(i => i.productId === product.id);
    if (existing) {
      this.billItems.update(items => items.map(i =>
        i.productId === product.id
          ? { ...i, quantity: i.quantity + 1, total: i.pricePerUnit * (i.quantity + 1) }
          : i
      ));
    } else {
      this.billItems.update(items => [...items, {
        productId:    product.id,
        productName:  product.name,
        pricePerUnit: product.sellingPrice,
        quantity:     1,
        total:        product.sellingPrice,
      }]);
    }
    this.paidAmount.set(this.grandTotal());
  }

  bakeryIncrementFromCart(productId: number): void {
    this.billItems.update(items => items.map(i =>
      i.productId === productId
        ? { ...i, quantity: i.quantity + 1, total: i.pricePerUnit * (i.quantity + 1) }
        : i
    ));
    this.paidAmount.set(this.grandTotal());
  }

  bakeryDecrement(productId: number): void {
    const item = this.billItems().find(i => i.productId === productId);
    if (!item) return;
    if (item.quantity <= 1) {
      this.billItems.update(items => items.filter(i => i.productId !== productId));
    } else {
      this.billItems.update(items => items.map(i =>
        i.productId === productId
          ? { ...i, quantity: i.quantity - 1, total: i.pricePerUnit * (i.quantity - 1) }
          : i
      ));
    }
    this.paidAmount.set(this.grandTotal());
  }

  clearCart(): void { this.billItems.set([]); this.paidAmount.set(0); }

  addItem(): void {
    const p = this.activeProducts()[0]; if (!p) return;
    const customer = this.selectedCustomer();
    const price = customer ? this.svc.getEffectivePrice(p, customer) : p.sellingPrice;
    this.billItems.update(items => [...items, {
      productId:    p.id,
      productName:  p.name,
      pricePerUnit: price,
      quantity:     1,
      total:        price,
    }]);
  }

  removeItem(i: number): void {
    this.billItems.update(items => items.filter((_, idx) => idx !== i));
  }

  onProductChange(i: number, pid: number): void {
    const product = this.productSearchResults().find(p => p.id === +pid)
                 ?? this.products().find(p => p.id === +pid);
    if (!product) return;
    const customer = this.selectedCustomer();
    const price = customer ? this.svc.getEffectivePrice(product, customer) : product.sellingPrice;
    this.billItems.update(items => items.map((item, idx) =>
      idx === i
        ? { ...item, productId: product.id, productName: product.name, pricePerUnit: price, total: price * item.quantity }
        : item
    ));
  }

  onQtyChange(i: number, qty: number): void {
    const q = Math.max(1, qty || 1);
    this.billItems.update(items => items.map((item, idx) =>
      idx === i ? { ...item, quantity: q, total: item.pricePerUnit * q } : item
    ));
  }

  onPriceChange(i: number, price: number): void {
    const p = Math.max(0, price || 0);
    this.billItems.update(items => items.map((item, idx) =>
      idx === i ? { ...item, pricePerUnit: p, total: p * item.quantity } : item
    ));
  }

  adjQty(i: number, delta: number): void {
    const item = this.billItems()[i];
    if (item) this.onQtyChange(i, item.quantity + delta);
  }

  onPaymentTypeChange(type: PaymentType): void {
    if (this.isWalkIn() && type === 'Credit') {
      this.toast('Walk-in customers must pay in full — Cash or UPI only.', 'error'); return;
    }
    this.paymentType.set(type);
    if (type === 'Credit') this.paidAmount.set(0);
    else this.clampPaid(this.paidAmount());
  }

  clampPaid(val: number): void { this.paidAmount.set(Math.max(0, val)); }

  saveOrder(andNew = false, openInvoiceAfter = false): void {
    if (this.billItems().length === 0) { this.toast('Add at least one item.', 'error'); return; }
    const customer = this.selectedCustomer();
    if (!this.isBakery() && !customer) { this.toast('Please select a customer.', 'error'); return; }
    if (this.isWalkIn() && this.paymentType() === 'Credit') {
      this.toast('Walk-in customers cannot use credit. Please select Cash or UPI.', 'error');
      this.paymentType.set('Cash'); return;
    }

    const subTotal   = this.itemsSubTotal();
    const finalTotal = this.grandTotal();
    if (finalTotal === 0) { this.toast('Total cannot be zero.', 'error'); return; }

    const customerId   = customer?.id   ?? 0;
    const customerName = customer?.name ?? 'Walk-in Customer';
    const s            = this.settings();
    const gst          = computeGst(subTotal, s as any);
    const paid         = this.isCredit() ? 0 : this.paidAmount();
    const balanceAmt   = Math.max(0, finalTotal - paid);
    const status: OrderStatus = paid >= finalTotal ? 'Paid' : paid > 0 ? 'Partial' : 'Credit';

    if (this.isWalkIn() && status !== 'Paid') {
      this.toast('Walk-in customers must pay the full amount.', 'error'); return;
    }

    this.isSavingOrder.set(true);
    const isEditing = this.editingOrder();

    const orderPayload = {
      customerId, customerName,
      items:         this.billItems() as OrderItem[],
      grandTotal:    finalTotal,
      paidAmount:    paid,
      balance:       balanceAmt,
      paymentType:   this.paymentType(),
      status,
      deliveryNote:  this.orderNote(),
      subTotal,
      taxableAmount: gst.taxableAmount,
      gstType:       s.gstEnabled ? s.gstType : 'None',
      cgstRate:      s.gstEnabled ? (s.cgstRate ?? 0) : 0,
      sgstRate:      s.gstEnabled ? (s.sgstRate ?? 0) : 0,
      igstRate:      s.gstEnabled ? (s.igstRate ?? 0) : 0,
      cgstAmount:    gst.cgst,
      sgstAmount:    gst.sgst,
      igstAmount:    gst.igst,
      totalGst:      gst.totalGst,
    };

    if (isEditing) {
      this.svc.updateOrder(isEditing.id, orderPayload as any).subscribe({
        next: updatedOrder => {
          this.svc.recomputeCustomerDues();
          this.svc.getTodaySummary().subscribe();
          this.toast(`Order #${isEditing.id} updated.`, 'success');
          this.isSavingOrder.set(false); this.resetForm();
          this.ordersPage.set(1); this.loadOrders();
          if (openInvoiceAfter && updatedOrder) this.openInvoice(updatedOrder as Order);
        },
        error: (err: Error) => {
          this.toast(err.message || 'Failed to update order.', 'error');
          this.isSavingOrder.set(false);
        },
      });
    } else {
      this.svc.createOrder(orderPayload as any).subscribe({
        next: newOrder => {
          this.svc.getTodaySummary().subscribe();
          this.toast(`Order #${newOrder.id} saved! ₹${finalTotal}`, 'success');
          this.isSavingOrder.set(false);
          if (andNew || (this.isBakery() && !openInvoiceAfter)) { this.resetForm(); }
          else if (!openInvoiceAfter) { this.resetForm(); }
          if (openInvoiceAfter) { this.resetForm(); this.openInvoice(newOrder); }
          this.ordersPage.set(1); this.loadOrders();
        },
        error: (err: Error) => {
          this.toast(err.message || 'Failed to save order.', 'error');
          this.isSavingOrder.set(false);
        },
      });
    }
  }

  startEdit(order: Order): void {
    this.editingOrder.set(order);
    const customer = this.customers().find(c => c.id === order.customerId);
    if (customer) { this._selectedCustomerId.set(customer.id); this.customerSearch.set(customer.name); }
    this.billItems.set(order.items.map(i => ({ ...i })));
    this.paymentType.set(order.paymentType);
    this.paidAmount.set(order.paidAmount);
    this.orderNote.set(order.deliveryNote || '');
    this.activeView.set('new-bill');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit(): void { this.editingOrder.set(null); this.resetForm(); }

  resetForm(): void {
    this._selectedCustomerId.set(null);
    this.customerSearch.set('');
    this.billItems.set([]);
    this.paidAmount.set(0);
    this.paymentType.set('Cash');
    this.orderNote.set('');
    this.editingOrder.set(null);
    this.mobileCartOpen.set(false);
  }

  goOrderPage(p: number): void {
    if (p >= 1 && p <= this.totalOrdPages()) { this.ordersPage.set(p); this.loadOrders(); }
  }

  openOrderDetail(order: Order): void {
    this.viewOrderDetail.set(order);
    this.orderPayments.set([]);
    this.loadingPayments.set(true);
    this.svc.getPaymentsByOrder(order.id).subscribe({
      next:  p  => { this.orderPayments.set(p); this.loadingPayments.set(false); },
      error: () => this.loadingPayments.set(false),
    });
  }

  deleteOrder(order: Order): void {
    if (!confirm(`Delete Order #${order.id}? This action cannot be undone.`)) return;
    this.isDeletingOrder.set(true);
    this.svc.deleteOrder(order.id).subscribe({
      next: () => {
        this.toast(`Order #${order.id} deleted.`, 'success');
        this.viewOrderDetail.set(null);
        this.isDeletingOrder.set(false);
        const newTotal = this.ordersTotal() - 1;
        const maxPage  = Math.max(1, Math.ceil(newTotal / this.ordersPageSize));
        if (this.ordersPage() > maxPage) this.ordersPage.set(maxPage);
        this.loadOrders();
        this.svc.getTodaySummary().subscribe();
      },
      error: (err: Error) => {
        this.toast(err.message || 'Failed to delete order.', 'error');
        this.isDeletingOrder.set(false);
      },
    });
  }

  openInvoice(order: Order): void { this.invoiceOrder.set(order); this.viewOrderDetail.set(null); }
  closeInvoice(): void { this.invoiceOrder.set(null); }

  fmtInvoiceDate(d: Date | string): string {
    const s = this.settings() as any;
    const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long', year: 'numeric' };
    if (s?.invoiceShowTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
    return new Date(d).toLocaleDateString('en-IN', opts);
  }

  getDisplayAmount(): number {
    const order = this.invoiceOrder();
    if (!order) return 0;
    return order.status === 'Paid' ? order.grandTotal : order.balance;
  }

  // ══════════════════════════════════════════════════════════
  // FIX 3: printInvoice — mobile-friendly print
  // Mobile browsers block window.open(), so on mobile we inject
  // a temporary @media print stylesheet and call window.print()
  // directly. Desktop still uses the popup window approach.
  // ══════════════════════════════════════════════════════════
  // printInvoice(): void {
  //   const el = document.getElementById('inv-print-area');
  //   if (!el) return;

  //   // Detect mobile device
  //   const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  //   if (isMobile) {
  //     // Mobile: inject print CSS into current document, print, then clean up
  //     const styleId = 'inv-mobile-print-style';
  //     let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  //     if (!styleEl) {
  //       styleEl = document.createElement('style');
  //       styleEl.id = styleId;
  //       document.head.appendChild(styleEl);
  //     }
  //     styleEl.textContent = `
  //       @media print {
  //         body > * { display: none !important; }
  //         .inv-mask {
  //           display: block !important;
  //           position: static !important;
  //           background: none !important;
  //           padding: 0 !important;
  //           backdrop-filter: none !important;
  //         }
  //         .inv-shell {
  //           max-height: none !important;
  //           box-shadow: none !important;
  //           background: #fff !important;
  //           border-radius: 0 !important;
  //           animation: none !important;
  //           overflow: visible !important;
  //           display: block !important;
  //         }
  //         .inv-toolbar { display: none !important; }
  //         .inv-preview-area {
  //           padding: 0 !important;
  //           background: #fff !important;
  //           overflow: visible !important;
  //         }
  //         #inv-print-area {
  //           box-shadow: none !important;
  //           border-radius: 0 !important;
  //         }
  //         .inv-doc { padding: 16px 20px !important; }
  //         .inv-header {
  //           display: flex !important;
  //           flex-direction: row !important;
  //           justify-content: space-between !important;
  //           align-items: flex-start !important;
  //           gap: 16px !important;
  //           margin-bottom: 16px !important;
  //         }
  //         .inv-brand { flex: 1 !important; min-width: 0 !important; }
  //         .inv-brand-icon {
  //           width: 40px !important;
  //           height: 40px !important;
  //           font-size: 18px !important;
  //           border-radius: 9px !important;
  //         }
  //         .inv-business-name { font-size: 15px !important; }
  //         .inv-meta {
  //           text-align: right !important;
  //           flex-shrink: 0 !important;
  //           max-width: none !important;
  //         }
  //         .inv-meta-badge {
  //           font-size: 10px !important;
  //           margin-bottom: 6px !important;
  //         }
  //         .inv-meta-table { margin-left: auto !important; }
  //         .imt-lbl { text-align: right !important; font-size: 10px !important; }
  //         .imt-val  { text-align: right !important; font-size: 12px !important; }
  //         .inv-items-table tbody tr:hover { background: transparent !important; }
  //         .inv-totals { justify-content: flex-end !important; }
  //         .inv-totals-inner { width: 220px !important; }
  //         .inv-footer {
  //           flex-direction: row !important;
  //           justify-content: space-between !important;
  //           align-items: flex-end !important;
  //         }
  //         .inv-footer-right { text-align: right !important; flex-shrink: 0 !important; }
  //         .inv-sig-line { margin-left: auto !important; }
  //         @page { margin: 8mm; size: A4; }
  //       }
  //     `;
  //     window.print();
  //     // Clean up after print dialog closes
  //     setTimeout(() => {
  //       if (styleEl) styleEl.textContent = '';
  //     }, 1500);
  //     return;
  //   }

  //   // Desktop: open popup window
  //   const invoiceHtml = el.outerHTML;
  //   const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
  //     .map(s => s.outerHTML).join('\n');
  //   const printWin = window.open('', '_blank', 'width=900,height=700');
  //   if (!printWin) { this.printFallback(); return; }
  //   printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice</title>${styles}<style>
  //     * { margin:0; padding:0; box-sizing:border-box; }
  //     body { background:#fff; font-family:'DM Sans',sans-serif; }
  //     #inv-print-area { width:100%; max-width:800px; margin:0 auto; box-shadow:none!important; border-radius:0!important; }
  //     .inv-doc { padding:24px 32px!important; }
  //     .inv-header { display:flex!important; flex-direction:row!important; justify-content:space-between!important; align-items:flex-start!important; gap:24px!important; margin-bottom:20px!important; }
  //     .inv-brand { flex:1!important; min-width:0!important; }
  //     .inv-meta { text-align:right!important; flex-shrink:0!important; max-width:none!important; }
  //     .inv-meta-table { margin-left:auto!important; }
  //     .imt-lbl { text-align:right!important; font-size:11px!important; }
  //     .imt-val { text-align:right!important; font-size:13px!important; }
  //     .inv-items-table tbody tr:hover { background:transparent!important; }
  //     .inv-totals { justify-content:flex-end!important; }
  //     .inv-totals-inner { width:260px!important; }
  //     .inv-logo-img { width:52px!important; height:52px!important; border-radius:10px!important; object-fit:cover!important; }
  //     @page { margin:10mm; size:A4; }
  //   </style></head><body>${invoiceHtml}<script>window.onload=function(){setTimeout(function(){window.print();window.close();},400);};<\/script></body></html>`);
  //   printWin.document.close();
  // }

  printInvoice(): void {
    const el = document.getElementById('inv-print-area');
    if (!el) return;

    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isMobile) {
      // ── Mobile fix ────────────────────────────────────────────────────────
      // Android Chrome cannot print position:fixed elements — the modal is
      // invisible during print, producing a blank page.
      // Solution: clone the invoice node into a plain <div> appended to
      // <body>, hide everything else with @media print, print, then remove.

      const CLONE_ID   = 'inv-mobile-print-clone';
      const STYLE_ID   = 'inv-mobile-print-style';

      // Remove any leftover clone from a previous print attempt
      document.getElementById(CLONE_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();

      // Clone the invoice content into a plain in-flow div
      const clone = el.cloneNode(true) as HTMLElement;
      clone.id    = CLONE_ID;
      clone.style.cssText = [
        'position:static',
        'display:block',
        'width:100%',
        'max-width:800px',
        'margin:0 auto',
        'box-shadow:none',
        'border-radius:0',
        'background:#fff',
      ].join(';');
      document.body.appendChild(clone);

      // Inject print styles: hide everything except the clone
      const styleEl       = document.createElement('style');
      styleEl.id          = STYLE_ID;
      styleEl.textContent = `
        @media print {
          body > *                          { display: none !important; }
          body > #${CLONE_ID}              { display: block !important; }
          #${CLONE_ID}                     {
            position: static  !important;
            box-shadow: none  !important;
            border-radius: 0  !important;
            background: #fff  !important;
            width: 100%       !important;
            padding: 0        !important;
          }
          #${CLONE_ID} .inv-doc            { padding: 16px 20px !important; }
          #${CLONE_ID} .inv-header {
            display: flex           !important;
            flex-direction: row     !important;
            justify-content: space-between !important;
            align-items: flex-start !important;
            gap: 16px               !important;
            margin-bottom: 16px     !important;
          }
          #${CLONE_ID} .inv-brand          { flex: 1 !important; min-width: 0 !important; }
          #${CLONE_ID} .inv-brand-icon     {
            width: 40px   !important;
            height: 40px  !important;
            font-size: 18px !important;
            border-radius: 9px !important;
          }
          #${CLONE_ID} .inv-business-name  { font-size: 15px !important; }
          #${CLONE_ID} .inv-meta           { text-align: right !important; flex-shrink: 0 !important; }
          #${CLONE_ID} .inv-meta-badge     { font-size: 10px !important; margin-bottom: 6px !important; }
          #${CLONE_ID} .inv-meta-table     { margin-left: auto !important; }
          #${CLONE_ID} .imt-lbl            { text-align: right !important; font-size: 10px !important; }
          #${CLONE_ID} .imt-val            { text-align: right !important; font-size: 12px !important; }
          #${CLONE_ID} .inv-totals         { justify-content: flex-end !important; }
          #${CLONE_ID} .inv-totals-inner   { width: 220px !important; }
          #${CLONE_ID} .inv-footer {
            flex-direction: row             !important;
            justify-content: space-between !important;
            align-items: flex-end           !important;
          }
          #${CLONE_ID} .inv-sig-line       { margin-left: auto !important; }
          #${CLONE_ID} .inv-items-table tbody tr:hover { background: transparent !important; }
          @page { margin: 8mm; size: A4; }
        }
      `;
      document.head.appendChild(styleEl);

      // Small delay so the clone renders before the print dialog opens
      setTimeout(() => {
        window.print();
        // Clean up after the dialog closes
        setTimeout(() => {
          document.getElementById(CLONE_ID)?.remove();
          document.getElementById(STYLE_ID)?.remove();
        }, 1500);
      }, 120);

      return;
    }

    // ── Desktop: existing popup window approach (unchanged) ──────────────────
    const invoiceHtml = el.outerHTML;
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map(s => s.outerHTML).join('\n');
    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) { this.printFallback(); return; }
    printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice</title>${styles}<style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { background:#fff; font-family:'DM Sans',sans-serif; }
      #inv-print-area { width:100%; max-width:800px; margin:0 auto; box-shadow:none!important; border-radius:0!important; }
      .inv-doc { padding:24px 32px!important; }
      .inv-header { display:flex!important; flex-direction:row!important; justify-content:space-between!important; align-items:flex-start!important; gap:24px!important; margin-bottom:20px!important; }
      .inv-brand { flex:1!important; min-width:0!important; }
      .inv-meta { text-align:right!important; flex-shrink:0!important; max-width:none!important; }
      .inv-meta-table { margin-left:auto!important; }
      .imt-lbl { text-align:right!important; font-size:11px!important; }
      .imt-val { text-align:right!important; font-size:13px!important; }
      .inv-items-table tbody tr:hover { background:transparent!important; }
      .inv-totals { justify-content:flex-end!important; }
      .inv-totals-inner { width:260px!important; }
      .inv-logo-img { width:52px!important; height:52px!important; border-radius:10px!important; object-fit:cover!important; }
      @page { margin:10mm; size:A4; }
    </style></head><body>${invoiceHtml}<script>window.onload=function(){setTimeout(function(){window.print();window.close();},400);};<\/script></body></html>`);
    printWin.document.close();
  }

  private printFallback(): void {
    const styleId = 'inv-print-fallback-style';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = styleId; document.head.appendChild(styleEl); }
    styleEl.textContent = `@media print {
      body > * { display:none!important; }
      .inv-mask { display:block!important; position:static!important; background:none!important; padding:0!important; }
      .inv-shell { max-height:none!important; box-shadow:none!important; background:#fff!important; border-radius:0!important; animation:none!important; }
      .inv-toolbar { display:none!important; }
      .inv-preview-area { padding:0!important; background:#fff!important; overflow:visible!important; }
      #inv-print-area { box-shadow:none!important; border-radius:0!important; }
      .inv-doc { padding:20px 24px!important; }
      .inv-header { flex-direction:row!important; }
      .inv-meta { text-align:right!important; max-width:none!important; }
      .imt-lbl { text-align:right!important; }
      .imt-val { text-align:right!important; }
      .inv-totals { justify-content:flex-end!important; }
      .inv-totals-inner { width:260px!important; }
      @page { margin:10mm; size:A4; }
    }`;
    window.print();
    setTimeout(() => { if (styleEl) styleEl.textContent = ''; }, 1000);
  }

  async shareInvoicePdf(): Promise<void> {
    const o = this.invoiceOrder();
    if (!o) return;
    this.isSharingPdf.set(true);
    try {
      const el = document.getElementById('inv-print-area');
      if (!el) throw new Error('Invoice element not found');
      await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const html2canvas = (window as any).html2canvas;
      const { jsPDF }   = (window as any).jspdf;
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, windowWidth: el.scrollWidth, windowHeight: el.scrollHeight });
      const A4_W = 210, A4_H = 297, MARGIN = 10;
      const imgW = A4_W - MARGIN * 2;
      const imgH = (canvas.height / canvas.width) * imgW;
      const pdf  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      let finalW = imgW, finalH = imgH;
      const maxH = A4_H - MARGIN * 2;
      if (finalH > maxH) { const scale = maxH / finalH; finalH = maxH; finalW = imgW * scale; }
      const centeredX = (A4_W - finalW) / 2;
      const imgData   = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', centeredX, MARGIN, finalW, finalH);
      const filename = `Invoice_${o.id}_${o.customerName.replace(/\s+/g, '_')}.pdf`;
      if (navigator.canShare && navigator.share) {
        const pdfBlob = pdf.output('blob');
        const file    = new File([pdfBlob], filename, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title: `Invoice #${o.id}`, text: `Invoice from ${this.settings().businessName || 'My Business'}`, files: [file] });
          this.isSharingPdf.set(false); return;
        }
      }
      pdf.save(filename);
      this.toast('Invoice saved as PDF.', 'success');
    } catch (err: any) {
      if (err?.name !== 'AbortError') { console.error('Share PDF error:', err); this.toast('Could not share PDF. Downloading instead.', 'error'); }
    } finally { this.isSharingPdf.set(false); }
  }

  private loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = () => resolve(); s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  toast(msg: string, type: 'success' | 'error'): void {
    this.toastMsg.set(msg); this.toastType.set(type);
    setTimeout(() => this.toastMsg.set(''), 3000);
  }

  getStatusClass(status: string): string {
    return ({ Paid: 'st-paid', Credit: 'st-credit', Partial: 'st-partial' } as any)[status] || '';
  }

  getInvStatusClass(status: string): string {
    return ({ Paid: 'inv-st-paid', Credit: 'inv-st-credit', Partial: 'inv-st-partial' } as any)[status] ?? '';
  }

  // ══════════════════════════════════════════════════════════
  // FIX 1: timeAgo — correct timezone handling
  // Dates from the server may come as strings without a timezone
  // suffix (e.g. "2026-05-14T02:53:00" instead of "...Z").
  // Without the Z, JavaScript treats them as LOCAL time, which
  // causes the offset error (e.g. IST = UTC+5:30 → shows 5h ago).
  // Solution: if the string has no timezone info, append 'Z' to
  // parse it as UTC, matching how the server stores/returns it.
  // ══════════════════════════════════════════════════════════
  // timeAgo(date: Date | string): string {
  //   let d: Date;
  //   if (typeof date === 'string') {
  //     // Check if string already has timezone info (Z, +, or -)
  //     const hasTimezone = date.endsWith('Z') ||
  //                         /[+-]\d{2}:\d{2}$/.test(date) ||
  //                         /[+-]\d{4}$/.test(date);
  //     d = new Date(hasTimezone ? date : date + 'Z');
  //   } else {
  //     d = date;
  //   }

  //   const diff = Date.now() - d.getTime();
  //   const m = Math.floor(diff / 60000);
  //   if (m < 1)  return 'Just now';
  //   if (m < 60) return `${m}m ago`;
  //   const h = Math.floor(m / 60);
  //   if (h < 24) return `${h}h ago`;
  //   return `${Math.floor(h / 24)}d ago`;
  // }

  timeAgo(date: Date | string | null): string {
    if (!date) return '—';

    let d: Date;

    if (typeof date === 'string') {

      // Convert SQL datetime to ISO UTC
      // "2026-05-12 10:13:14"
      // → "2026-05-12T10:13:14Z"

      const normalized = date.includes('T')
        ? date
        : date.replace(' ', 'T');

      const withTimezone =
        normalized.endsWith('Z') ||
        /[+-]\d{2}:\d{2}$/.test(normalized)
          ? normalized
          : normalized + 'Z';

      d = new Date(withTimezone);

    } else {
      d = date;
    }

    const diff = Date.now() - d.getTime();

    const m = Math.floor(diff / 60000);

    if (m < 1)  return 'Just now';
    if (m < 60) return `${m}m ago`;

    const h = Math.floor(m / 60);

    if (h < 24) return `${h}h ago`;

    return `${Math.floor(h / 24)}d ago`;
  }

  fmtDate(d: Date | string): string {
    return new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  getCategoryIcon(cat: string): string {
    const map: Record<string, string> = {
      'All': 'bi-grid-fill', 'Bread': 'bi-egg-fill', 'Cakes': 'bi-cake2-fill',
      'Pastries': 'bi-star-fill', 'Snacks': 'bi-bag-fill', 'Drinks': 'bi-cup-straw', 'Other': 'bi-three-dots',
    };
    return map[cat] ?? 'bi-circle';
  }

  amountInWords(amount: number): string {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const toWords = (n: number): string => {
      if (n === 0)        return '';
      if (n < 20)         return ones[n];
      if (n < 100)        return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
      if (n < 1000)       return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + toWords(n % 100) : '');
      if (n < 100000)     return toWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + toWords(n % 1000) : '');
      if (n < 10000000)   return toWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + toWords(n % 100000) : '');
      return toWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + toWords(n % 10000000) : '');
    };
    if (!amount || isNaN(amount)) return 'Zero Rupees Only';
    const rupees = Math.floor(amount);
    const paise  = Math.round((amount - rupees) * 100);
    let result = (toWords(rupees) || 'Zero') + ' Rupees';
    if (paise > 0) result += ' and Paise ' + toWords(paise);
    return result + ' Only';
  }

  private todayStr(): string { return new Date().toISOString().slice(0, 10); }

  private daysAgoStr(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
}