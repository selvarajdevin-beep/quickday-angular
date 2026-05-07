// models/report.models.ts
// ─────────────────────────────────────────────────────────────────────────────
// Request param interfaces and response types for the two server-paginated
// report endpoints. Used by ReportService, SharedStateService, and ReportsComponent.
// ─────────────────────────────────────────────────────────────────────────────
import { PagedResult } from '../services/shared-state.interfaces';

export interface GetCustomerReportParams {
  from?:     string;
  to?:       string;
  search?:   string;
  /** Column to sort by: totalOrders | totalSales | totalPaid | totalDue | lastOrderDate */
  sortBy?:   string;
  /** ASC | DESC (default DESC) */
  sortDir?:  string;
  page?:     number;
  pageSize?: number;
}

export interface GetPurchaseReportParams {
  from?:     string;
  to?:       string;
  search?:   string;
  page?:     number;
  pageSize?: number;
}

/**
 * Customer report row — field names match C# CustomerReportRow record exactly
 * (camelCase via ASP.NET JSON serialization).
 * C#: TotalSales (not totalAmount), LastOrderDate is DateTime? (ISO string in JSON)
 */
export interface CustomerReportRow {
  customerId:    number;
  customerName:  string;
  phone:         string;
  customerType:  string;
  totalOrders:   number;
  totalSales:    number;   // ← C# TotalSales (was wrong as totalAmount)
  totalPaid:     number;
  totalDue:      number;
  lastOrderDate: string | null;  // ISO datetime string from C# DateTime?, parse carefully
}

/**
 * Purchase report row — field names match C# PurchaseReportRow record exactly.
 * C#: TotalPurchases (not totalOrders), TotalDue (not creditPending)
 */
export interface PurchaseReportRow {
  supplierId:       number;
  supplierName:     string;
  phone:            string;
  totalPurchases:   number;  // ← C# TotalPurchases (was wrong as totalOrders)
  totalAmount:      number;
  totalPaid:        number;
  totalDue:         number;  // ← C# TotalDue (was wrong as creditPending)
  lastPurchaseDate: string | null;
}

/** Full-period totals returned alongside the paged purchase rows. */
export interface PurchaseReportGlobalSummary {
  totalSuppliers: number;
  totalPurchases: number;
  totalAmount:    number;
  totalDue:       number;
}

/**
 * Purchase report response — extends PagedResult with global summary.
 * The globalSummary holds totals across ALL pages (not just the current page).
 */
export interface PagedPurchaseReportResult<T> extends PagedResult<T> {
  globalSummary: PurchaseReportGlobalSummary;
}