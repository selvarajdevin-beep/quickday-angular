// src/app/services/shared-state.interfaces.ts
// ─────────────────────────────────────────────────────────────────────────────
// UPDATED: All hardcoded const arrays/objects (SHOP_TYPES, SHOP_TYPE_ICONS,
// SHOP_UNIT_TYPES, SHOP_PRODUCT_CATEGORIES, ALL_MODULES, etc.) have been
// REMOVED from this file.  They now live in the AppConstants DB table and
// are fetched via ConstantsService.
//
// TypeScript TYPES and INTERFACES remain here — they are compile-time
// contracts and do not belong in the DB.
//
// Migration guide for components:
//   Before:  import { SHOP_TYPES, SHOP_TYPE_ICONS } from '…/shared-state.interfaces';
//   After:   inject ConstantsService and use:
//              this.cSvc.shopTypes()         → AppConstantItem[]
//              this.cSvc.shopTypeIconMap()   → Record<string,string>
//              this.cSvc.shopTypeValues()    → string[]
// ─────────────────────────────────────────────────────────────────────────────

// ── Core domain interfaces ────────────────────────────────────────────────────

export interface Product {
  id: number; name: string;
  unitType: string;
  capacity: string;
  category?: string;
  sellingPrice: number; purchasePrice: number; active: boolean;
  totalOrders: number; currentStock: number; minStockAlert: number;
}

export interface InventoryLog {
  id: number; productId: number; productName: string;
  type: 'IN' | 'OUT'; quantity: number; reason: string;
  reference?: string; date: Date;
}

export type CustomerType = 'Hotel' | 'Home';

export interface Customer {
  id: number; name: string; phone: string; address: string;
  customerType: CustomerType; defaultPricePerCan: number;
  defaultPriceProductId: number; usePriceFromProduct: boolean;
  active: boolean; totalOrders: number; totalDue: number;
  lastOrderDate: Date | null; createdAt: Date;
}

export interface OrderItem {
  productId: number; productName: string; quantity: number;
  pricePerUnit: number; total: number;
}

export type PaymentType = 'Cash' | 'UPI' | 'Credit';
export type OrderStatus  = 'Paid' | 'Partial' | 'Credit';

export interface Order {
  id: number; customerId: number; customerName: string; items: OrderItem[];
  grandTotal: number; paidAmount: number; balance: number;
  paymentType: PaymentType; status: OrderStatus;
  deliveryNote?: string; createdAt: Date; updatedAt?: Date;

  // ── GST snapshot — frozen at order creation time ──────────────────────────
  subTotal:      number;
  taxableAmount: number;
  gstType:       string;
  cgstRate:      number;
  sgstRate:      number;
  igstRate:      number;
  cgstAmount:    number;
  sgstAmount:    number;
  igstAmount:    number;
  totalGst:      number;
}

export interface PaymentRecord {
  id: number; customerId: number; orderId?: number;
  amount: number; paymentType: 'Cash' | 'UPI'; note: string; date: Date;
}

export interface Supplier {
  id: number; name: string; phone: string; address: string; active: boolean;
  totalPurchases: number; totalAmount: number; amountDue: number;
  lastPurchaseDate: Date | null; createdAt: Date;
}

export type PurchaseStatus = 'Paid' | 'Credit';

export interface PurchaseItem {
  productId: number; productName: string; quantity: number;
  pricePerUnit: number; total: number;
}

export interface Purchase {
  id: number; supplierId: number; supplierName: string; items: PurchaseItem[];
  grandTotal: number; paidAmount: number; balance: number;
  paymentStatus: PurchaseStatus; notes?: string;
  createdAt: Date; updatedAt?: Date;
}

export type ExpenseType =
  | 'Petrol' | 'Salary' | 'Vehicle Maintenance' | 'Rent' | 'Electricity' | 'Misc';

export interface Expense {
  id: number; type: ExpenseType; amount: number;
  date: Date; notes: string; createdAt: Date;
}

export interface DateRange { from: string; to: string; }

// ── Pagination ────────────────────────────────────────────────────────────────

export interface PagedResult<T> {
  items:        T[];
  totalCount:   number;
  totalAmount?: number;
  page:         number;
  pageSize:     number;
  totalPages:   number;
  hasNext:      boolean;
  hasPrev:      boolean;
}

// ── Customer summary ──────────────────────────────────────────────────────────

export interface CustomerDueItem {
  id:            number;
  name:          string;
  phone:         string;
  totalDue:      number;
  lastOrderDate: string | null;
}

export interface CustomerSummary {
  totalCount:       number;
  activeCount:      number;
  inactiveCount:    number;
  hotelCount:       number;
  homeCount:        number;
  customersWithDue: number;
  totalDueAmount:   number;
  topDueCustomers:  CustomerDueItem[];
}

// ── Order dashboard summary ───────────────────────────────────────────────────

export interface OrderDailySummary {
  date:  string;
  total: number;
  id:    number;
}

export interface OrderRecentItem {
  id:           number;
  customerId:   number;
  customerName: string;
  itemsJson:    string;
  grandTotal:   number;
  status:       string;
  createdAt:    string;
}

export interface OrderDashboardSummary {
  dailyTotals:  OrderDailySummary[];
  recentOrders: OrderRecentItem[];
}

// ── Report interfaces ─────────────────────────────────────────────────────────

export interface ReportSummary {
  totalSales: number; totalExpenses: number; totalPurchases: number;
  netProfit: number; totalOrders: number; creditPending: number;
}

export interface DailySalesRow {
  date: string; orderCount: number; cashAmount: number;
  upiAmount: number; creditAmount: number; totalSales: number;
}

export interface CustomerReportRow {
  customerId:    number;
  customerName:  string;
  phone:         string;
  customerType:  string;
  totalOrders:   number;
  totalSales:    number;
  totalPaid:     number;
  totalDue:      number;
  lastOrderDate: string | null;
}

export interface ExpenseReportRow { type: string; amount: number; count: number; }

export interface ProfitReportRow {
  month: string; income: number; expenses: number; purchases: number; profit: number;
}

export interface PurchaseReportRow {
  supplierId:       number;
  supplierName:     string;
  phone?:           string;
  totalPurchases:   number;   // C# sends TotalPurchases
  totalAmount:      number;   // C# sends TotalAmount
  totalPaid:        number;
  totalDue:         number;   // C# sends TotalDue (NOT creditPending/balance)
  lastPurchaseDate: string | null;
}

// ── GST config ────────────────────────────────────────────────────────────────

export type GstType = 'GST' | 'IGST' | 'None';

export interface GstConfig {
  gstEnabled:       boolean;
  gstType:          GstType;
  cgstRate:         number;
  sgstRate:         number;
  igstRate:         number;
  showGstOnInvoice: boolean;
}

// ── Settings ──────────────────────────────────────────────────────────────────

// ShopType kept as a TypeScript type for compile-time safety.
// The list of valid values is served by ConstantsService.shopTypeValues().
export type ShopType =
  | 'Water Can Supplier' | 'Bakery' | 'Mobile Shop' | 'Grocery Store'
  | 'Pharmacy' | 'Stationery' | 'Fruit & Vegetable' | 'Dairy & Milk'
  | 'Restaurant / Mess' | 'Hardware Store' | 'Clothing & Textiles'
  | 'Electronics' | 'General Store' | 'Other';

export interface BusinessSettings {
  businessName: string; ownerName: string; phone: string;
  email: string; address: string; gstin: string;
  shopType?: ShopType;
  themeColor: string; currency: 'INR' | 'USD' | 'EUR' | 'GBP';
  currencySymbol?: string;
  subscriptionPlan: 'Free' | 'Basic' | 'Pro';
  subscriptionStartDate?: string;
  subscriptionExpiry: string;
  gstEnabled:       boolean;
  gstType:          GstType;
  cgstRate:         number;
  sgstRate:         number;
  igstRate:         number;
  showGstOnInvoice: boolean;
  logoUrl:           string;
  showLogoOnInvoice: boolean;
  invoiceShowTime:   boolean;
}

// ── Permissions ───────────────────────────────────────────────────────────────

// AppModule names are also now DB-driven via ConstantsService.appModuleValues().
// ALL_MODULES is removed — use ConstantsService.appModuleValues() instead.
export type UserRole = 'Admin' | 'Worker';

export interface Permission {
  module:    string;
  canView:   boolean;
  canCreate: boolean;
  canEdit:   boolean;
  canDelete: boolean;
}

export interface RoleTemplate {
  role:        UserRole;
  permissions: Permission[];
}

export interface AppUser {
  id:               number;
  name:             string;
  phone:            string;
  email?:           string;
  role:             UserRole;
  status:           string;
  lastLogin:        Date | null;
  createdAt:        Date;
  permissions:      Permission[];
  designation?:     string;
  department?:      string;
  address?:         string;
  emergencyContact?: string;
  notes?:           string;
  dateOfJoining?:   Date;
  salaryDetails?:   SalaryDetail;
}

export interface SalaryDetail {
  monthlySalary: number;
  salaryType:    'Fixed' | 'Hourly' | 'Daily';
  bankAccount?:  string;
  bankName?:     string;
  ifsc?:         string;
}

export interface BusinessAccount {
  businessAccountId: number;
  businessName:      string;
  ownerName:         string;
}

// ── GST helper ────────────────────────────────────────────────────────────────

export function computeGst(subtotal: number, settings: BusinessSettings): {
  cgst: number; sgst: number; igst: number;
  totalGst: number; grandTotal: number; taxableAmount: number;
} {
  if (!settings.gstEnabled || !settings.showGstOnInvoice) {
    return { cgst: 0, sgst: 0, igst: 0, totalGst: 0,
             grandTotal: subtotal, taxableAmount: subtotal };
  }

  if (settings.gstType === 'GST') {
    const taxableAmount = subtotal;
    const cgst          = parseFloat(((taxableAmount * (settings.cgstRate ?? 0)) / 100).toFixed(2));
    const sgst          = parseFloat(((taxableAmount * (settings.sgstRate ?? 0)) / 100).toFixed(2));
    const totalGst      = parseFloat((cgst + sgst).toFixed(2));
    const grandTotal    = parseFloat((taxableAmount + totalGst).toFixed(2));
    return { cgst, sgst, igst: 0, totalGst, grandTotal, taxableAmount };
  }

  if (settings.gstType === 'IGST') {
    const taxableAmount = subtotal;
    const igst          = parseFloat(((taxableAmount * (settings.igstRate ?? 0)) / 100).toFixed(2));
    const grandTotal    = parseFloat((taxableAmount + igst).toFixed(2));
    return { cgst: 0, sgst: 0, igst, totalGst: igst, grandTotal, taxableAmount };
  }

  return { cgst: 0, sgst: 0, igst: 0, totalGst: 0,
           grandTotal: subtotal, taxableAmount: subtotal };
}

// ── Functions removed (now served from ConstantsService) ─────────────────────
//
// REMOVED:  getUnitTypesForShop()     → use ConstantsService.unitTypesForShop()
// REMOVED:  getCategoriesForShop()    → use ConstantsService.categoriesForShop()
// REMOVED:  SHOP_UNIT_TYPES           → use ConstantsService.shopUnitTypes (signal of map)
// REMOVED:  SHOP_PRODUCT_CATEGORIES   → use ConstantsService.shopCategories (signal of map)
// REMOVED:  ALL_MODULES               → use ConstantsService.appModuleValues()
// REMOVED:  SHOP_TYPES                → use ConstantsService.shopTypeValues()
// REMOVED:  SHOP_TYPE_ICONS           → use ConstantsService.shopTypeIconMap()