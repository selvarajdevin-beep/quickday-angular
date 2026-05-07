// src/app/services/core-state.service.ts
// ─────────────────────────────────────────────────────────────────────────────
// UPDATED: shopUnitTypes and shopCategories are now derived from
// ConstantsService signals instead of the removed SHOP_UNIT_TYPES /
// SHOP_PRODUCT_CATEGORIES hardcoded objects.
//
// ALL_MODULES is no longer imported — allModules is derived from
// ConstantsService.appModuleValues().
// ─────────────────────────────────────────────────────────────────────────────
import { Injectable, signal, computed, inject } from '@angular/core';
import {
  Product, InventoryLog, Customer, Order, PaymentRecord,
  Supplier, Purchase, Expense, AppUser, BusinessSettings,
  Permission, UserRole,
} from './shared-state.interfaces';
import { ConstantsService } from './constants.service';

const ADMIN_BASE_MODULES = [
  'Dashboard', 'Billing', 'Customers', 'Products', 'Inventory',
  'Purchases', 'Expenses', 'Suppliers', 'Reports', 'Users', 'Settings', 'Account',
];

function buildAdminPermissions(modules: string[]): Permission[] {
  return modules.map(m => ({
    module: m, canView: true, canCreate: true, canEdit: true, canDelete: true,
  }));
}

function buildWorkerPermissions(modules: string[]): Permission[] {
  const workerVisible = new Set(['Dashboard', 'Billing', 'Customers', 'Products', 'Inventory', 'Account']);
  return modules.map(m => ({
    module:    m,
    canView:   workerVisible.has(m),
    canCreate: m === 'Billing',
    canEdit:   false,
    canDelete: false,
  }));
}

const CURRENCY_SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

@Injectable({ providedIn: 'root' })
export class CoreStateService {

  // ConstantsService is loaded before this service is first used
  // (via APP_INITIALIZER or ShellComponent.ngOnInit → ConstantsService.load()).
  private readonly cSvc = inject(ConstantsService);

  // ── Module list — DB-driven ────────────────────────────────────────────────
  // Falls back to the static list if ConstantsService hasn't loaded yet.
  readonly allModules = computed(() => {
    const dbModules = this.cSvc.appModuleValues();
    return dbModules.length > 0 ? dbModules : ADMIN_BASE_MODULES;
  });

  // ── Role permissions — initialised with defaults, overwritten by SettingsService ──
  readonly _rolePermissions = signal<Record<UserRole, Permission[]>>({
    Admin:  buildAdminPermissions(ADMIN_BASE_MODULES),
    Worker: buildWorkerPermissions(ADMIN_BASE_MODULES),
  });

  // ── Business Settings ──────────────────────────────────────────────────────
  readonly _settings = signal<BusinessSettings>({
    businessName: '', ownerName: '', phone: '', email: '',
    address: '', gstin: '', shopType: 'Other',
    themeColor: '#0057FF', currency: 'INR', currencySymbol: '₹',
    subscriptionPlan: 'Free', subscriptionStartDate: undefined,
    subscriptionExpiry: '',
    gstEnabled:       false,
    gstType:          'None',
    cgstRate:         2.5,
    sgstRate:         2.5,
    igstRate:         5,
    showGstOnInvoice: true,
    logoUrl:           '',
    showLogoOnInvoice: true,
    invoiceShowTime:   false,
  });

  readonly settings       = this._settings.asReadonly();
  readonly businessName   = computed(() => this._settings().businessName);
  readonly ownerName      = computed(() => this._settings().ownerName);
  readonly themeColor     = computed(() => this._settings().themeColor);
  readonly currency       = computed(() => this._settings().currency);
  readonly currencySymbol = computed(() => CURRENCY_SYMBOLS[this._settings().currency] ?? '₹');
  readonly shopType       = computed(() => this._settings().shopType ?? 'Other');

  // ── Shop-type driven lists — now from ConstantsService ────────────────────
  readonly shopUnitTypes = computed(() =>
    this.cSvc.unitTypesForShop(this._settings().shopType)
  );

  readonly shopCategories = computed(() =>
    this.cSvc.categoriesForShop(this._settings().shopType)
  );

  // ── Users ─────────────────────────────────────────────────────────────────
  readonly _users = signal<AppUser[]>([]);
  readonly users  = this._users.asReadonly();

  // ── Suppliers ─────────────────────────────────────────────────────────────
  readonly _suppliers = signal<Supplier[]>([]);
  readonly suppliers  = this._suppliers.asReadonly();
  readonly totalSupplierDue = computed(() =>
    this._suppliers().reduce((s, s2) => s + s2.amountDue, 0)
  );

  // ── Purchases ─────────────────────────────────────────────────────────────
  readonly _purchases = signal<Purchase[]>([]);
  readonly purchases  = this._purchases.asReadonly();
  readonly _purchaseSummaryOverride = signal<{
    totalThisMonth: number; creditPending: number; purchaseCount: number;
  }>({ totalThisMonth: 0, creditPending: 0, purchaseCount: 0 });
  readonly purchaseSummary = this._purchaseSummaryOverride.asReadonly();

  // ── Products ──────────────────────────────────────────────────────────────
  readonly _products = signal<Product[]>([]);
  readonly products       = this._products.asReadonly();
  readonly lowStockItems  = computed(() =>
    this._products().filter(p => p.active && p.currentStock <= p.minStockAlert)
  );
  readonly lowStockCount  = computed(() => this.lowStockItems().length);
  readonly activeProducts = computed(() => this._products().filter(p => p.active));

  readonly _productSummaryOverride = signal<{
    totalProducts: number; activeCount: number; inactiveCount: number;
    lowStockCount: number; categoryCount: number;
  }>({ totalProducts: 0, activeCount: 0, inactiveCount: 0, lowStockCount: 0, categoryCount: 0 });
  readonly productSummary = this._productSummaryOverride.asReadonly();

  // ── Inventory logs ─────────────────────────────────────────────────────────
  readonly _invLogs = signal<InventoryLog[]>([]);
  readonly invLogs  = this._invLogs.asReadonly();

  // ── Customers ─────────────────────────────────────────────────────────────
  readonly _customers = signal<Customer[]>([]);
  readonly customers          = this._customers.asReadonly();
  readonly totalCreditPending = computed(() =>
    this._customers().reduce((s, c) => s + c.totalDue, 0)
  );

  // ── Orders ────────────────────────────────────────────────────────────────
  readonly _orders = signal<Order[]>([]);
  readonly orders  = this._orders.asReadonly();

  // ── Payments ──────────────────────────────────────────────────────────────
  readonly _payments = signal<PaymentRecord[]>([]);
  readonly payments  = this._payments.asReadonly();

  // ── Expenses ──────────────────────────────────────────────────────────────
  readonly _expenses = signal<Expense[]>([]);
  readonly expenses  = this._expenses.asReadonly();
  readonly _expenseSummaryOverride = signal<{
    totalThisMonth: number;
    byType: { type: string; amount: number }[];
  }>({ totalThisMonth: 0, byType: [] });
  readonly expenseSummary = this._expenseSummaryOverride.asReadonly();

  // ── Today summary ─────────────────────────────────────────────────────────
  readonly _todaySummaryOverride = signal<{
    todaySales:    number;
    todayOrders:   number;
    cashAmount:    number;
    upiAmount:     number;
    creditAmount:  number;
    totalCustomers: number;
    creditPending:  number;
  }>({
    todaySales: 0, todayOrders: 0, cashAmount: 0,
    upiAmount: 0, creditAmount: 0, totalCustomers: 0, creditPending: 0,
  });

  readonly todaySummary = this._todaySummaryOverride.asReadonly();
}