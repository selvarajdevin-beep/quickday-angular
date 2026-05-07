/**
 * ReportService — UPDATED
 * ─────────────────────────────────────────────────────────────────────────────
 * Changes vs previous version:
 *   1. getCustomerReport() — accepts GetCustomerReportParams, hits
 *      GET /api/reports/customer-wise, returns PagedResult<CustomerReportRow>.
 *   2. getPurchaseReport() — accepts GetPurchaseReportParams, hits
 *      GET /api/reports/purchase-wise, returns PagedPurchaseReportResult<PurchaseReportRow>
 *      which includes globalSummary.totalAmount for the summary KPI card.
 *   3. report.models.ts created alongside this file — import from there.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, delay, map } from 'rxjs/operators';
import { CoreStateService } from './core-state.service';
import {
  DateRange, ReportSummary, DailySalesRow, CustomerReportRow,
  ExpenseReportRow, ProfitReportRow, PurchaseReportRow, ExpenseType,
  PagedResult,
} from './shared-state.interfaces';
import {
  GetCustomerReportParams,
  GetPurchaseReportParams,
  PagedPurchaseReportResult,
} from '../models/report.models';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { ApiResponse } from '../models/auth.models';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ReportService {
  // private readonly api = '/api/reports';
  private readonly api = `${environment.apiUrl}/reports`;

  constructor(private http: HttpClient, private core: CoreStateService) {}

  // ── Timezone-safe date helper ─────────────────────────────────
  private localDateStr(d: Date): string {
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // ─────────────────────────────────────────────────────────────

  getSummary(range?: DateRange): Observable<ReportSummary> {
    const inR = (d: Date) => {
      if (!range) return true;
      const t = new Date(d).getTime();
      return t >= new Date(range.from).getTime() && t <= new Date(range.to + 'T23:59:59').getTime();
    };
    const orders    = this.core._orders().filter(o => inR(o.createdAt));
    const expenses  = this.core._expenses().filter(e => inR(e.date));
    const purchases = this.core._purchases().filter(p => inR(p.createdAt));
    return of({
      totalSales:     orders.reduce((s, o) => s + o.grandTotal, 0),
      totalExpenses:  expenses.reduce((s, e) => s + e.amount, 0),
      totalPurchases: purchases.reduce((s, p) => s + p.grandTotal, 0),
      netProfit:
        orders.reduce((s, o) => s + o.grandTotal, 0) -
        expenses.reduce((s, e) => s + e.amount, 0) -
        purchases.reduce((s, p) => s + p.grandTotal, 0),
      totalOrders:   orders.length,
      creditPending: this.core.totalCreditPending(),
    }).pipe(delay(100));
  }

  getDailySales(range?: DateRange): Observable<DailySalesRow[]> {
    const map = new Map<string, { cash: number; upi: number; credit: number; count: number }>();

    for (const o of this.core._orders()) {
      const ds = this.localDateStr(new Date(o.createdAt));
      const ex = map.get(ds) ?? { cash: 0, upi: 0, credit: 0, count: 0 };
      if (o.paymentType === 'Cash') ex.cash += o.paidAmount;
      else if (o.paymentType === 'UPI') ex.upi += o.paidAmount;
      else ex.credit += o.grandTotal;
      ex.count++;
      map.set(ds, ex);
    }

    const toDate   = range?.to   ? new Date(range.to)   : new Date();
    const fromDate = range?.from ? new Date(range.from) : (() => { const d = new Date(); d.setDate(d.getDate() - 29); return d; })();
    toDate.setHours(23, 59, 59);

    const rows: DailySalesRow[] = [];
    const cursor = new Date(fromDate); cursor.setHours(0, 0, 0, 0);

    while (cursor <= toDate) {
      const ds   = this.localDateStr(cursor);
      const real = map.get(ds);
      if (real) {
        rows.push({
          date:         ds,
          orderCount:   real.count,
          cashAmount:   real.cash,
          upiAmount:    real.upi,
          creditAmount: real.credit,
          totalSales:   real.cash + real.upi + real.credit,
        });
      } else {
        const seed   = (cursor.getDate() * 31 + cursor.getMonth() * 17) % 1000;
        const base   = (cursor.getDay() === 0 || cursor.getDay() === 6) ? 3200 : 5400;
        const cash   = Math.round(base * 0.30 + seed * 0.8);
        const upi    = Math.round(base * 0.25 + seed * 0.4);
        const credit = Math.round(base * 0.45 + seed * 0.3);
        rows.push({
          date:         ds,
          orderCount:   Math.round(8 + seed % 12),
          cashAmount:   cash,
          upiAmount:    upi,
          creditAmount: credit,
          totalSales:   cash + upi + credit,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return of(rows).pipe(delay(200));
  }

  // ── Customer-wise report — server-paginated ───────────────────
  // GET /api/reports/customer-wise
  getCustomerReport(params?: GetCustomerReportParams): Observable<PagedResult<CustomerReportRow>> {
    let httpParams = new HttpParams();
    if (params?.from)     httpParams = httpParams.set('from',     params.from);
    if (params?.to)       httpParams = httpParams.set('to',       params.to);
    if (params?.search)   httpParams = httpParams.set('search',   params.search);
    if (params?.sortBy)   httpParams = httpParams.set('sortBy',   params.sortBy);
    if (params?.sortDir)  httpParams = httpParams.set('sortDir',  params.sortDir);
    if (params?.page     != null) httpParams = httpParams.set('page',     String(params.page));
    if (params?.pageSize != null) httpParams = httpParams.set('pageSize', String(params.pageSize));

    return this.http
      .get<ApiResponse<PagedResult<CustomerReportRow>>>(`${this.api}/customer-wise`, { params: httpParams })
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load customer report.');
          return res.data;
        }),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  getExpenseReport(range?: DateRange): Observable<ExpenseReportRow[]> {
    const inR = (d: Date) => {
      if (!range) return true;
      const t = new Date(d).getTime();
      return t >= new Date(range.from).getTime() && t <= new Date(range.to + 'T23:59:59').getTime();
    };
    const filtered = this.core._expenses().filter(e => inR(e.date));
    return of(
      (['Salary', 'Petrol', 'Vehicle Maintenance', 'Rent', 'Electricity', 'Misc'] as ExpenseType[]).map(type => ({
        type,
        amount: filtered.filter(e => e.type === type).reduce((s, e) => s + e.amount, 0),
        count:  filtered.filter(e => e.type === type).length,
      })).filter(r => r.amount > 0)
    ).pipe(delay(150));
  }

  getProfitReport(): Observable<ProfitReportRow[]> {
    const rows: ProfitReportRow[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const income    = this.core._orders()   .filter(o => new Date(o.createdAt) >= d && new Date(o.createdAt) <= end).reduce((s, o) => s + o.grandTotal, 0);
      const expenses  = this.core._expenses() .filter(e => new Date(e.date)      >= d && new Date(e.date)      <= end).reduce((s, e) => s + e.amount, 0);
      const purchases = this.core._purchases().filter(p => new Date(p.createdAt) >= d && new Date(p.createdAt) <= end).reduce((s, p) => s + p.grandTotal, 0);
      rows.push({
        month:   d.toLocaleString('en-IN', { month: 'short', year: 'numeric' }),
        income, expenses, purchases,
        profit:  income - expenses - purchases,
      });
    }
    return of(rows).pipe(delay(200));
  }

  // ── Purchase-wise report — server-paginated ───────────────────
  // GET /api/reports/purchase-wise
  // Returns PagedPurchaseReportResult which includes globalSummary
  // so the summary KPI card always shows the full-period total amount
  // regardless of which page is currently displayed.
  getPurchaseReport(params?: GetPurchaseReportParams): Observable<PagedPurchaseReportResult<PurchaseReportRow>> {
    let httpParams = new HttpParams();
    if (params?.from)     httpParams = httpParams.set('from',     params.from);
    if (params?.to)       httpParams = httpParams.set('to',       params.to);
    if (params?.search)   httpParams = httpParams.set('search',   params.search);
    if (params?.page     != null) httpParams = httpParams.set('page',     String(params.page));
    if (params?.pageSize != null) httpParams = httpParams.set('pageSize', String(params.pageSize));

    return this.http
      .get<ApiResponse<PagedPurchaseReportResult<PurchaseReportRow>>>(`${this.api}/purchase-wise`, { params: httpParams })
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load purchase report.');
          return res.data;
        }),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  private _extractError(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      const msg = err.error?.message;
      if (typeof msg === 'string' && msg.length > 0) return new Error(msg);
      if (err.status === 0)   return new Error('Cannot reach server. Check your connection.');
      if (err.status === 401) return new Error('Session expired. Please log in again.');
      if (err.status === 403) return new Error('You do not have permission to perform this action.');
      if (err.status === 409) return new Error('This order was modified by someone else. Please refresh.');
      if (err.status === 500) return new Error('Server error. Please try again later.');
    }
    if (err instanceof Error) return err;
    return new Error('An unexpected error occurred.');
  }
}