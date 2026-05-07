// src/app/services/superadmin.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiResponse } from '../models/auth.models';
import {
  SuperAdminDashboardDto,
  PagedShopsDto,
  ShopDetailDto,
  UpdateSubscriptionRequest,
  PaymentHistoryItemDto,
  CreatePaymentRequest,
  UpdatePaymentRequest,
  PagedPaymentsDto,
  RevenueStatsDto,
} from '../models/superadmin.models';
import { environment } from '../../environments/environment';

export interface GetShopsParams {
  page?:     number;
  pageSize?: number;
  search?:   string;
  plan?:     string;
  status?:   string;
}

export interface GetPaymentsParams {
  page?:              number;
  pageSize?:          number;
  businessAccountId?: number;
  plan?:              string;
  status?:            string;
}

@Injectable({ providedIn: 'root' })
export class SuperAdminService {

  // private readonly api = '/api/superadmin';
  private readonly api = `${environment.apiUrl}/superadmin`;

  constructor(private http: HttpClient) {}

  // ── Dashboard ──────────────────────────────────────────────────────────────
  getDashboard(): Observable<SuperAdminDashboardDto> {
    return this.http
      .get<ApiResponse<SuperAdminDashboardDto>>(`${this.api}/dashboard`)
      .pipe(
        map(r => { if (!r.success || !r.data) throw new Error(r.message ?? 'Failed.'); return r.data; }),
        catchError(e => throwError(() => this._err(e))),
      );
  }

  // ── Shops ──────────────────────────────────────────────────────────────────
  getShops(params?: GetShopsParams): Observable<PagedShopsDto> {
    let p = new HttpParams();
    if (params?.page)     p = p.set('page',     String(params.page));
    if (params?.pageSize) p = p.set('pageSize', String(params.pageSize));
    if (params?.search)   p = p.set('search',   params.search);
    if (params?.plan)     p = p.set('plan',     params.plan);
    if (params?.status)   p = p.set('status',   params.status);
    return this.http
      .get<ApiResponse<PagedShopsDto>>(`${this.api}/shops`, { params: p })
      .pipe(
        map(r => { if (!r.success || !r.data) throw new Error(r.message ?? 'Failed.'); return r.data; }),
        catchError(e => throwError(() => this._err(e))),
      );
  }

  getShopById(id: number): Observable<ShopDetailDto> {
    return this.http
      .get<ApiResponse<ShopDetailDto>>(`${this.api}/shops/${id}`)
      .pipe(
        map(r => { if (!r.success || !r.data) throw new Error(r.message ?? 'Failed.'); return r.data; }),
        catchError(e => throwError(() => this._err(e))),
      );
  }

  updateSubscription(id: number, req: UpdateSubscriptionRequest): Observable<ShopDetailDto> {
    return this.http
      .put<ApiResponse<ShopDetailDto>>(`${this.api}/shops/${id}/subscription`, req)
      .pipe(
        map(r => { if (!r.success || !r.data) throw new Error(r.message ?? 'Failed.'); return r.data; }),
        catchError(e => throwError(() => this._err(e))),
      );
  }

  toggleStatus(id: number): Observable<ShopDetailDto> {
    return this.http
      .patch<ApiResponse<ShopDetailDto>>(`${this.api}/shops/${id}/toggle-status`, {})
      .pipe(
        map(r => { if (!r.success || !r.data) throw new Error(r.message ?? 'Failed.'); return r.data; }),
        catchError(e => throwError(() => this._err(e))),
      );
  }

  // ── Payments ───────────────────────────────────────────────────────────────
  getPayments(params?: GetPaymentsParams): Observable<PagedPaymentsDto> {
    let p = new HttpParams();
    if (params?.page)              p = p.set('page',              String(params.page));
    if (params?.pageSize)          p = p.set('pageSize',          String(params.pageSize));
    if (params?.businessAccountId) p = p.set('businessAccountId', String(params.businessAccountId));
    if (params?.plan)              p = p.set('plan',              params.plan);
    if (params?.status)            p = p.set('status',            params.status);
    return this.http
      .get<ApiResponse<PagedPaymentsDto>>(`${this.api}/payments`, { params: p })
      .pipe(
        map(r => { if (!r.success || !r.data) throw new Error(r.message ?? 'Failed.'); return r.data; }),
        catchError(e => throwError(() => this._err(e))),
      );
  }

  createPayment(req: CreatePaymentRequest): Observable<PaymentHistoryItemDto> {
    return this.http
      .post<ApiResponse<PaymentHistoryItemDto>>(`${this.api}/payments`, req)
      .pipe(
        map(r => { if (!r.success || !r.data) throw new Error(r.message ?? 'Failed.'); return r.data; }),
        catchError(e => throwError(() => this._err(e))),
      );
  }

  /** PUT /api/superadmin/payments/{id} — edit plan and/or status */
  updatePayment(id: number, req: UpdatePaymentRequest): Observable<PaymentHistoryItemDto> {
    return this.http
      .put<ApiResponse<PaymentHistoryItemDto>>(`${this.api}/payments/${id}`, req)
      .pipe(
        map(r => { if (!r.success || !r.data) throw new Error(r.message ?? 'Failed.'); return r.data; }),
        catchError(e => throwError(() => this._err(e))),
      );
  }

  // ── Revenue ────────────────────────────────────────────────────────────────
  getRevenueStats(): Observable<RevenueStatsDto> {
    return this.http
      .get<ApiResponse<RevenueStatsDto>>(`${this.api}/revenue`)
      .pipe(
        map(r => { if (!r.success || !r.data) throw new Error(r.message ?? 'Failed.'); return r.data; }),
        catchError(e => throwError(() => this._err(e))),
      );
  }

  // ── Error handler ──────────────────────────────────────────────────────────
  private _err(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      const msg = err.error?.message;
      if (typeof msg === 'string' && msg.length) return new Error(msg);
      if (err.status === 0)   return new Error('Cannot reach server.');
      if (err.status === 401) return new Error('Session expired. Please log in again.');
      if (err.status === 403) return new Error('Access denied. Super Admin only.');
      if (err.status === 500) return new Error('Server error. Please try again.');
    }
    if (err instanceof Error) return err;
    return new Error('An unexpected error occurred.');
  }
}