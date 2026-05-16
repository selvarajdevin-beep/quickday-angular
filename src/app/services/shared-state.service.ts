// src/app/services/shared-state.service.ts
export * from './shared-state.interfaces';
export { ConstantsService } from './constants.service';
export type { AppConstantItem, AppConstantsDto } from '../models/constants.models';

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { CoreStateService }  from './core-state.service';
import { SettingsService }   from './settings.service';
import { UserService }       from './user.service';
import { ProductService }    from './product.service';
import { InventoryService }  from './inventory.service';
import { CustomerService }   from './customer.service';
import { OrderService }      from './order.service';
import { SupplierService }   from './supplier.service';
import { PurchaseService }   from './purchase.service';
import { ExpenseService }    from './expense.service';
import { ReportService }     from './report.service';
import { ConstantsService }  from './constants.service';

import {
  BusinessSettings, Permission, UserRole,
  AppUser, Product, Customer,
  Supplier, Purchase, Expense, DateRange,
  PagedResult,
} from './shared-state.interfaces';
import { GetProductsParams }   from '../models/product.models';
import { GetPurchasesParams }  from '../models/purchase.models';
import { GetExpensesParams }   from '../models/expense.models';
import { GetSuppliersParams }  from '../models/supplier.models';
import { GetUsersParams }      from '../models/user.models';
import {
  GetCustomerReportParams,
  GetPurchaseReportParams,
} from '../models/report.models';
import { CustomerSummary, OrderDashboardSummary } from './shared-state.interfaces';

@Injectable({ providedIn: 'root' })
export class SharedStateService {

  constructor(
    private core:        CoreStateService,
    private settingsSvc: SettingsService,
    private userSvc:     UserService,
    private productSvc:  ProductService,
    private invSvc:      InventoryService,
    private customerSvc: CustomerService,
    private orderSvc:    OrderService,
    private supplierSvc: SupplierService,
    private purchaseSvc: PurchaseService,
    private expenseSvc:  ExpenseService,
    private reportSvc:   ReportService,
    private cSvc:        ConstantsService,
    private http:        HttpClient,
  ) {
    this.settings       = this.settingsSvc.settings;
    this.businessName   = this.settingsSvc.businessName;
    this.ownerName      = this.settingsSvc.ownerName;
    this.themeColor     = this.settingsSvc.themeColor;
    this.currency       = this.settingsSvc.currency;
    this.currencySymbol = this.settingsSvc.currencySymbol;
    this.shopType       = this.settingsSvc.shopType;
    this.shopUnitTypes  = this.settingsSvc.shopUnitTypes;
    this.shopCategories = this.settingsSvc.shopCategories;

    this.users          = this.userSvc.users;
    this.products       = this.productSvc.products;
    this.lowStockItems  = this.productSvc.lowStockItems;
    this.lowStockCount  = this.productSvc.lowStockCount;
    this.activeProducts = this.productSvc.activeProducts;
    this.invLogs        = this.invSvc.invLogs;

    this.customers          = this.customerSvc.customers;
    this.totalCreditPending = this.customerSvc.totalCreditPending;

    this.suppliers        = this.supplierSvc.suppliers;
    this.totalSupplierDue = this.supplierSvc.totalSupplierDue;

    this.purchases       = this.purchaseSvc.purchases;
    this.purchaseSummary = this.purchaseSvc.purchaseSummary;

    this.expenses       = this.expenseSvc.expenses;
    this.expenseSummary = this.expenseSvc.expenseSummary;

    this.todaySummary = this.core.todaySummary;
    this.orders       = this.orderSvc.orders;
  }

  // ── Settings signals ──────────────────────────────────────────────────────
  settings!:       typeof this.settingsSvc.settings;
  businessName!:   typeof this.settingsSvc.businessName;
  ownerName!:      typeof this.settingsSvc.ownerName;
  themeColor!:     typeof this.settingsSvc.themeColor;
  currency!:       typeof this.settingsSvc.currency;
  currencySymbol!: typeof this.settingsSvc.currencySymbol;
  shopType!:       typeof this.settingsSvc.shopType;
  shopUnitTypes!:  typeof this.settingsSvc.shopUnitTypes;
  shopCategories!: typeof this.settingsSvc.shopCategories;

  // ── Constants — Signal accessors (call cSvc directly in components) ───────
  get paymentTypes()      { return this.cSvc.paymentTypes; }
  get orderStatuses()     { return this.cSvc.orderStatuses; }
  get purchaseStatuses()  { return this.cSvc.purchaseStatuses; }
  get customerTypes()     { return this.cSvc.customerTypes; }
  get expenseTypes()      { return this.cSvc.expenseTypes; }
  get gstTypes()          { return this.cSvc.gstTypes; }
  get subscriptionPlans() { return this.cSvc.subscriptionPlans; }
  get currencies()        { return this.cSvc.currencies; }
  get themeColors()       { return this.cSvc.themeColors; }
  get salaryTypes()       { return this.cSvc.salaryTypes; }
  get shopTypes()         { return this.cSvc.shopTypes; }
  get shopTypeIconMap()   { return this.cSvc.shopTypeIconMap; }
  get moduleIconMap()     { return this.cSvc.moduleIconMap; }
  get planFeatures()      { return this.cSvc.planFeatures; }

  // ── Domain signals ────────────────────────────────────────────────────────
  users!:              typeof this.userSvc.users;
  products!:           typeof this.productSvc.products;
  lowStockItems!:      typeof this.productSvc.lowStockItems;
  lowStockCount!:      typeof this.productSvc.lowStockCount;
  activeProducts!:     typeof this.productSvc.activeProducts;
  invLogs!:            typeof this.invSvc.invLogs;
  customers!:          typeof this.customerSvc.customers;
  totalCreditPending!: typeof this.customerSvc.totalCreditPending;
  suppliers!:          typeof this.supplierSvc.suppliers;
  totalSupplierDue!:   typeof this.supplierSvc.totalSupplierDue;
  purchases!:          typeof this.purchaseSvc.purchases;
  purchaseSummary!:    typeof this.purchaseSvc.purchaseSummary;
  expenses!:           typeof this.expenseSvc.expenses;
  expenseSummary!:     typeof this.expenseSvc.expenseSummary;
  todaySummary!:       typeof this.core.todaySummary;
  orders!:             typeof this.orderSvc.orders;

  // ════════════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ════════════════════════════════════════════════════════════════════════════

  getSettings()                                    { return this.settingsSvc.getSettings(); }
  saveSettings(d: Partial<BusinessSettings>)       { return this.settingsSvc.saveSettings(d); }
  getRoleTemplates()                               { return this.settingsSvc.getRoleTemplates(); }
  getRolePerms(role: UserRole)                     { return this.settingsSvc.getRolePerms(role); }
  visibleModulesSignal(role: UserRole)             { return this.settingsSvc.visibleModulesSignal(role); }
  visibleModulesForRole(role: UserRole): string[]  { return this.settingsSvc.visibleModulesForRole(role); }
  applyThemeToDom(color: string)                   { return this.settingsSvc.applyThemeToDom(color); }
  loadMyRolePermissions()                          { return this.settingsSvc.loadMyRolePermissions(); }
  saveRolePermissions(role: UserRole, perms: Permission[]) {
    return this.settingsSvc.saveRolePermissions(role, perms);
  }
  exportData()                                     { return this.settingsSvc.exportData(); }
  loadConstants()                                  { return this.cSvc.load(); }

  // ════════════════════════════════════════════════════════════════════════════
  // USERS
  // ════════════════════════════════════════════════════════════════════════════

  getUsers(p?: GetUsersParams)                          { return this.userSvc.getUsers(p); }
  createUser(d: Partial<AppUser> & { password?: string }) { return this.userSvc.createUser(d); }
  updateUser(id: number, d: Partial<AppUser>)           { return this.userSvc.updateUser(id, d); }
  toggleUserStatus(id: number)                          { return this.userSvc.toggleUserStatus(id); }
  deleteUser(id: number)                                { return this.userSvc.deleteUser(id); }
  resetPassword(id: number, pwd: string)                { return this.userSvc.resetPassword(id, pwd); }

  // ════════════════════════════════════════════════════════════════════════════
  // PRODUCTS
  // ════════════════════════════════════════════════════════════════════════════

  getProducts(p?: GetProductsParams)               { return this.productSvc.getProducts(p); }
  getProductSummary()                              { return this.productSvc.getProductSummary(); }
  createProduct(d: Partial<Product>)               { return this.productSvc.createProduct(d); }
  updateProduct(id: number, d: Partial<Product>)   { return this.productSvc.updateProduct(id, d); }
  toggleProductStatus(id: number)                  { return this.productSvc.toggleProductStatus(id); }

  // ════════════════════════════════════════════════════════════════════════════
  // INVENTORY
  // ════════════════════════════════════════════════════════════════════════════

  getInventoryLogs(from?: string, to?: string, search?: string, page = 1, pageSize = 10) {
    return this.invSvc.getInventoryLogs(from, to, search, page, pageSize);
  }
  adjustStock(pid: number, qty: number, type: 'IN' | 'OUT', reason: string, ref?: string) {
    return this.invSvc.adjustStock(pid, qty, type, reason, ref);
  }
  updateMinStockAlert(pid: number, min: number)    { return this.invSvc.updateMinStockAlert(pid, min); }

  // ════════════════════════════════════════════════════════════════════════════
  // CUSTOMERS
  // ════════════════════════════════════════════════════════════════════════════

  getCustomers(p?: Parameters<typeof this.customerSvc.getCustomers>[0]) {
    return this.customerSvc.getCustomers(p);
  }
  getCustomersAll()                                { return this.customerSvc.getCustomersAll(); }
  getCustomerSummary()                             { return this.customerSvc.getCustomerSummary(); }
  createCustomer(d: Partial<Customer>)             { return this.customerSvc.createCustomer(d); }
  updateCustomer(id: number, d: Partial<Customer>) { return this.customerSvc.updateCustomer(id, d); }
  toggleCustomerStatus(id: number)                 { return this.customerSvc.toggleCustomerStatus(id); }
  getEffectivePrice(product: Product, customer: Customer): number {
    return this.customerSvc.getEffectivePrice(product, customer);
  }
  recomputeCustomerDues(): void                    { this.customerSvc.recomputeCustomerDues(); }

  // ════════════════════════════════════════════════════════════════════════════
  // ORDERS
  // ════════════════════════════════════════════════════════════════════════════

  getOrders(p?: any)                               { return this.orderSvc.getOrders(p); }
  getOrdersAll(from?: string, to?: string)         { return this.orderSvc.getOrdersAll(from, to); }
  getOrdersDashboardSummary(from: string)          { return this.orderSvc.getOrdersDashboardSummary(from); }
  getOrdersByCustomer(cid: number, page = 1, ps = 10) {
    return this.orderSvc.getOrdersByCustomer(cid, page, ps);
  }
  getPaymentsByCustomer(cid: number, page = 1, ps = 10) {
    return this.orderSvc.getPaymentsByCustomer(cid, page, ps);
  }
  getPaymentsByOrder(orderId: number)              { return this.orderSvc.getPaymentsByOrder(orderId); }
  createOrder(d: any)                              { return this.orderSvc.createOrder(d); }
  updateOrder(id: number, d: any)                  { return this.orderSvc.updateOrder(id, d); }
  deleteOrder(id: number)                          { return this.orderSvc.deleteOrder(id); }
  recordPayment(cid: number, amount: number, type: 'Cash' | 'UPI', note: string, orderId?: number) {
    return this.orderSvc.recordPayment(cid, amount, type, note, orderId);
  }
  getTodaySummary()                                { return this.orderSvc.getTodaySummary(); }

  getOrdersByCustomerFiltered(
    cid:      number,
    page    = 1,
    ps      = 25,
    filters?: {
      dateFrom?: string;
      dateTo?:   string;
      search?:   string;
      status?:   string;
    }
  ) {
    return this.orderSvc.getOrdersByCustomerFiltered(cid, page, ps, filters);
  }
 

  // ════════════════════════════════════════════════════════════════════════════
  // SUPPLIERS
  // ════════════════════════════════════════════════════════════════════════════

  getSuppliers(p?: GetSuppliersParams)             { return this.supplierSvc.getSuppliers(p); }
  createSupplier(d: Partial<Supplier>)             { return this.supplierSvc.createSupplier(d); }
  updateSupplier(id: number, d: Partial<Supplier>) { return this.supplierSvc.updateSupplier(id, d); }
  toggleSupplierStatus(id: number)                 { return this.supplierSvc.toggleSupplierStatus(id); }
  getPurchasesBySupplier(id: number)               { return this.supplierSvc.getPurchasesBySupplier(id); }
  recordSupplierPayment(id: number, amount: number){ return this.supplierSvc.recordSupplierPayment(id, amount); }

  // ════════════════════════════════════════════════════════════════════════════
  // PURCHASES
  // ════════════════════════════════════════════════════════════════════════════

  getPurchases(p?: GetPurchasesParams)             { return this.purchaseSvc.getPurchases(p); }
  getPurchaseSummary()                             { return this.purchaseSvc.getPurchaseSummary(); }
  createPurchase(d: Omit<Purchase, 'id' | 'createdAt'>) { return this.purchaseSvc.createPurchase(d); }
  updatePurchase(id: number, d: Partial<Purchase>) { return this.purchaseSvc.updatePurchase(id, d); }
  markPurchasePaid(id: number)                     { return this.purchaseSvc.markPurchasePaid(id); }

  // ════════════════════════════════════════════════════════════════════════════
  // EXPENSES
  // ════════════════════════════════════════════════════════════════════════════

  getExpenses(p?: GetExpensesParams)               { return this.expenseSvc.getExpenses(p); }
  getExpenseSummary()                              { return this.expenseSvc.getExpenseSummary(); }
  createExpense(d: Partial<Expense>)               { return this.expenseSvc.createExpense(d); }
  updateExpense(id: number, d: Partial<Expense>)   { return this.expenseSvc.updateExpense(id, d); }
  deleteExpense(id: number)                        { return this.expenseSvc.deleteExpense(id); }

  // ════════════════════════════════════════════════════════════════════════════
  // REPORTS
  // ════════════════════════════════════════════════════════════════════════════

  getReportSummary(range?: DateRange)              { return this.reportSvc.getSummary(range); }
  getDailySales(range?: DateRange)                 { return this.reportSvc.getDailySales(range); }
  getCustomerReport(p?: GetCustomerReportParams)   { return this.reportSvc.getCustomerReport(p); }
  getExpenseReport(range?: DateRange)              { return this.reportSvc.getExpenseReport(range); }
  getProfitReport()                                { return this.reportSvc.getProfitReport(); }
  getPurchaseReport(p?: GetPurchaseReportParams)   { return this.reportSvc.getPurchaseReport(p); }

  applyProductSummary(s: { lowStockCount: number }): void {
    this.core._lowStockCountOverride.set(s.lowStockCount);
  }

  applyCustomerSummary(s: CustomerSummary): void {
    this.core._totalCreditPendingOverride.set(s.totalDueAmount);
  }
  refreshNotifications(): void {
    this.getProductSummary().subscribe({
      next:  s => this.applyProductSummary(s),
      error: () => {},
    });
    this.getCustomerSummary().subscribe({
      next:  s => this.applyCustomerSummary(s),
      error: () => {},
    });
  }
}