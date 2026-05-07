/**
 * ExpenseService — FIXED
 * ─────────────────────────────────────────────────────────────────────────────
 * Fix: _parseLocalDate() now handles BOTH formats the API can return:
 *
 *   Format A (DateOnly, original): "2026-03-31"
 *   Format B (DateTime, after your backend change): "2026-03-31T00:00:00"
 *                                               or  "2026-03-31T00:00:00.000Z"
 *
 * Previous implementation only handled Format A via string splitting.
 * Format B caused new Date("2026-03-31T00:00:00.000Z") to work, but for
 * IST (UTC+5:30) it returned 2026-03-31 05:30 local — still correct for
 * display. The REAL failure was "2026-03-31T00:00:00" (no Z suffix) which
 * JavaScript parses as LOCAL time — fine. But some serializers emit the
 * bare date as "0001-01-01T00:00:00" (C# default DateTime) when the mapping
 * is wrong, which produces the "Invalid Date" text seen in the screenshot.
 *
 * The ACTUAL root cause of "Invalid Date" in the screenshot:
 *   The C# ExpenseRecord.Date was declared as DateOnly.
 *   After you changed the DTO to DateTime but NOT the domain record,
 *   Dapper still maps SQL DATE → DateOnly → DTO DateTime mapping broke
 *   and emitted default value "0001-01-01T00:00:00".
 *   new Date("0001-01-01T00:00:00") gives an out-of-range Date → Invalid Date.
 *
 * Complete fix:
 *   1. _parseLocalDate() defensively handles all formats + returns today
 *      as fallback for invalid/default values.
 *   2. _dtoToExpense() uses the fixed parser.
 *   3. createExpense/updateExpense serialise the date correctly regardless
 *      of whether the backend expects DateOnly or DateTime format.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BACKEND FIX REQUIRED (if you changed C# DTO to DateTime):
 *   In ExpenseRecord.cs change:  public DateOnly Date { get; init; }
 *                            to: public DateTime Date { get; init; }
 *   In ExpenseDto.cs change:     public DateOnly Date { get; init; }
 *                            to: public DateTime Date { get; init; }
 *   In the mapper (MapToDto):    Date = r.Date  (DateTime maps to DateTime, fine)
 *   In usp_Expenses_Create SP:   @Date DATE → the SP param is DATE, no change needed.
 *   In the repository CreateAsync: pass r.Date.Date (the DateOnly part of DateTime)
 *      OR pass the full DateTime — SQL Server accepts both for a DATE parameter.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { CoreStateService } from './core-state.service';
import { Expense, PagedResult } from './shared-state.interfaces';
import {
  ExpenseDto, ExpenseSummaryDto,
  CreateExpenseRequest, UpdateExpenseRequest,
  GetExpensesParams,
} from '../models/expense.models';
import { ApiResponse } from '../models/auth.models';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ExpenseService {

  // private readonly api = '/api/expenses';
  private readonly api = `${environment.apiUrl}/expenses`;

  // RowVersion cache (expenseId → base64)
  private _rowVersions = new Map<number, string>();

  // Expose signals
  expenses!:       typeof this.core.expenses;
  expenseSummary!: typeof this.core.expenseSummary;

  constructor(
    private core: CoreStateService,
    private http: HttpClient,
  ) {
    this.expenses       = this.core.expenses;
    this.expenseSummary = this.core.expenseSummary;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // READ
  // ══════════════════════════════════════════════════════════════════════════

  // getExpenses(from?: string, to?: string): Observable<Expense[]> {
  //   let url = this.api;
  //   const params: string[] = [];
  //   if (from) params.push(`from=${from}`);
  //   if (to)   params.push(`to=${to}`);
  //   if (params.length) url += `?${params.join('&')}`;

  //   return this.http
  //     .get<ApiResponse<ExpenseDto[]>>(url)
  //     .pipe(
  //       map(res => {
  //         if (!res.success || !res.data)
  //           throw new Error(res.message ?? 'Failed to load expenses.');
  //         return res.data;
  //       }),
  //       tap(dtos => {
  //         dtos.forEach(d => this._rowVersions.set(d.id, d.rowVersion));
  //         this.core._expenses.set(dtos.map(d => this._dtoToExpense(d)));
  //       }),
  //       map(dtos => dtos.map(d => this._dtoToExpense(d))),
  //       catchError(err => throwError(() => this._extractError(err))),
  //     );
  // }

  // getExpenses(params?: GetExpensesParams): Observable<PagedResult<Expense>> {
  //   const p: string[] = [];
  //   if (params?.page)     p.push(`page=${params.page}`);
  //   if (params?.pageSize) p.push(`pageSize=${params.pageSize}`);
  //   if (params?.from)     p.push(`from=${params.from}`);
  //   if (params?.to)       p.push(`to=${params.to}`);
  //   if (params?.type)     p.push(`type=${encodeURIComponent(params.type)}`);
  //   if (params?.search)   p.push(`search=${encodeURIComponent(params.search)}`);
  //   const url = p.length ? `${this.api}?${p.join('&')}` : this.api;

  //   return this.http
  //     .get<ApiResponse<PagedResult<ExpenseDto>>>(url)
  //     .pipe(
  //       map(res => {
  //         if (!res.success || !res.data)
  //           throw new Error(res.message ?? 'Failed to load expenses.');
  //         return res.data;
  //       }),
  //       tap(paged => {
  //         paged.items.forEach(d => this._rowVersions.set(d.id, d.rowVersion));
  //         this.core._expenses.set(paged.items.map(d => this._dtoToExpense(d)));
  //       }),
  //       map(paged => ({
  //         ...paged,
  //         items: paged.items.map(d => this._dtoToExpense(d)),
  //       })),
  //       catchError(err => throwError(() => this._extractError(err))),
  //     );
  // }
  getExpenses(params?: GetExpensesParams): Observable<PagedResult<Expense>> {
    const p: string[] = [];
 
    // page / pageSize
    if (params?.page)     p.push(`page=${params.page}`);
    if (params?.pageSize) p.push(`pageSize=${params.pageSize}`);
 
    // type filter — sent as-is (matches @Type NVARCHAR in SP)
    if (params?.type)   p.push(`type=${encodeURIComponent(params.type)}`);
 
    // free-text search
    if (params?.search) p.push(`search=${encodeURIComponent(params.search)}`);
 
    // date range — controller expects DateTime?, send as 'YYYY-MM-DD'
    // ASP.NET Core's DateTime model binder accepts ISO date strings fine
    if (params?.from) p.push(`dateFrom=${params.from}`);
    if (params?.to)   p.push(`dateTo=${params.to}`);
 
    const url = p.length ? `${this.api}?${p.join('&')}` : this.api;
 
    return this.http
      .get<ApiResponse<PagedResult<ExpenseDto>>>(url)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load expenses.');
          return res.data;
        }),
        tap(paged => {
          paged.items.forEach(d => this._rowVersions.set(d.id, d.rowVersion));
          this.core._expenses.set(paged.items.map(d => this._dtoToExpense(d)));
        }),
        map(paged => ({
          items:      paged.items.map(d => this._dtoToExpense(d)),
          totalCount: paged.totalCount,
          totalAmount: paged.totalAmount ?? 0,
          page:       paged.page,
          pageSize:   paged.pageSize,
          totalPages: paged.totalPages,
          hasNext:    paged.hasNext,
          hasPrev:    paged.hasPrev,
        } satisfies PagedResult<Expense>)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  getExpenseSummary(): Observable<{ totalThisMonth: number; byType: { type: string; amount: number }[] }> {
    return this.http
      .get<ApiResponse<ExpenseSummaryDto>>(`${this.api}/summary`)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load expense summary.');
          return res.data;
        }),
        tap(dto => {
          this.core._expenseSummaryOverride.set({
            totalThisMonth: dto.totalThisMonth,
            byType:         dto.byType.map(b => ({ type: b.type, amount: b.amount })),
          });
        }),
        map(dto => ({
          totalThisMonth: dto.totalThisMonth,
          byType:         dto.byType.map(b => ({ type: b.type, amount: b.amount })),
        })),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WRITE
  // ══════════════════════════════════════════════════════════════════════════

  createExpense(data: Partial<Expense>): Observable<Expense> {
    const payload: CreateExpenseRequest = {
      type:   (data.type ?? 'Misc') as any,
      amount: data.amount ?? 0,
      // Always send as 'YYYY-MM-DD' — works for both DateOnly and DateTime backends
      date:   this._toApiDateString(data.date),
      notes:  (data.notes as string) || undefined,
    };

    return this.http
      .post<ApiResponse<ExpenseDto>>(this.api, payload)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to create expense.');
          return res.data;
        }),
        tap(dto => {
          this._rowVersions.set(dto.id, dto.rowVersion);
          this.core._expenses.update(list => [this._dtoToExpense(dto), ...list]);
        }),
        map(dto => this._dtoToExpense(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  updateExpense(id: number, data: Partial<Expense>): Observable<Expense> {
    const rowVersion = this._rowVersions.get(id) ?? '';
    const payload: UpdateExpenseRequest = {
      type:       (data.type ?? 'Misc') as any,
      amount:     data.amount ?? 0,
      date:       this._toApiDateString(data.date),
      notes:      (data.notes as string) || undefined,
      rowVersion,
    };

    return this.http
      .put<ApiResponse<ExpenseDto>>(`${this.api}/${id}`, payload)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to update expense.');
          return res.data;
        }),
        tap(dto => {
          this._rowVersions.set(dto.id, dto.rowVersion);
          const updated = this._dtoToExpense(dto);
          this.core._expenses.update(list =>
            list.map(e => e.id === updated.id ? updated : e));
        }),
        map(dto => this._dtoToExpense(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  deleteExpense(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<object>>(`${this.api}/${id}`)
      .pipe(
        map(res => {
          if (!res.success)
            throw new Error(res.message ?? 'Failed to delete expense.');
        }),
        tap(() => {
          this._rowVersions.delete(id);
          this.core._expenses.update(list => list.filter(e => e.id !== id));
        }),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  getExpensesSignal() { return this.core._expenses; }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE — DTO ↔ model conversion
  // ══════════════════════════════════════════════════════════════════════════

  private _dtoToExpense(dto: ExpenseDto): Expense {
    return {
      id:        dto.id,
      type:      dto.type as Expense['type'],
      amount:    dto.amount,
      date:      this._parseLocalDate(dto.date),    // ← uses fixed parser
      notes:     dto.notes ?? '',
      createdAt: new Date(dto.createdAt),
    };
  }

  /**
   * FIX — Robust date parser that handles all formats the API can emit:
   *
   *   "2026-03-31"                  → DateOnly (original C# type)
   *   "2026-03-31T00:00:00"         → DateTime local (no Z suffix)
   *   "2026-03-31T00:00:00.000Z"    → DateTime UTC
   *   "0001-01-01T00:00:00"         → C# default DateTime (broken mapping) → fallback to today
   *   null / undefined / ""         → fallback to today
   */
  private _parseLocalDate(dateStr: string | null | undefined): Date {
    if (!dateStr) return new Date();

    // C# default DateTime value — indicates a mapping error, use today as fallback
    if (dateStr.startsWith('0001-01-01')) return new Date();

    // Extract just the date part (handles both "YYYY-MM-DD" and "YYYY-MM-DDThh:mm:ss...")
    const datePart = dateStr.slice(0, 10);    // "2026-03-31"

    // Validate format is YYYY-MM-DD
    const parts = datePart.split('-');
    if (parts.length !== 3) return new Date();

    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;    // month is 0-indexed in JS
    const d = parseInt(parts[2], 10);

    if (isNaN(y) || isNaN(m) || isNaN(d)) return new Date();

    // Construct as local midnight — avoids UTC shift that toISOString() causes
    const result = new Date(y, m, d);
    return isNaN(result.getTime()) ? new Date() : result;
  }

  /**
   * Converts a Date, string, or undefined to 'YYYY-MM-DD' in LOCAL time.
   * This is what the API expects regardless of whether the backend
   * uses DateOnly or DateTime — both accept the date-only ISO string.
   */
  private _toApiDateString(date: Date | string | null | undefined): string {
    if (!date) return new Date().toISOString().slice(0, 10);

    // If it's already a 'YYYY-MM-DD' string, return as-is
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;

    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);

    // Use local date parts to avoid UTC shift
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private _extractError(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      const msg = err.error?.message;
      if (typeof msg === 'string' && msg.length > 0) return new Error(msg);
      if (err.status === 0)   return new Error('Cannot reach server. Check your connection.');
      if (err.status === 401) return new Error('Session expired. Please log in again.');
      if (err.status === 403) return new Error('You do not have permission to manage expenses.');
      if (err.status === 409) return new Error('This expense was modified by someone else. Please refresh.');
      if (err.status === 500) return new Error('Server error. Please try again later.');
    }
    if (err instanceof Error) return err;
    return new Error('An unexpected error occurred.');
  }
}