/**
 * PurchaseService
 * ─────────────────────────────────────────────────────────────────────────────
 * All operations now hit the real API:
 *   GET    /api/purchases                  → getPurchases()
 *   GET    /api/purchases/summary          → getPurchaseSummary()
 *   GET    /api/purchases/{id}             → getPurchaseById()
 *   POST   /api/purchases                  → createPurchase()
 *   PUT    /api/purchases/{id}             → updatePurchase()
 *   PATCH  /api/purchases/{id}/mark-paid   → markPurchasePaid()
 *
 * Signal contract is identical to before — SharedStateService.purchases
 * and CoreStateService._purchases stay in sync after every mutation.
 *
 * Key differences vs old mock implementation:
 *   • Inventory stock adjustment on create is done entirely in the SP
 *     (usp_Purchases_Create calls UPDATE Products SET CurrentStock).
 *     InventoryService.adjustStock() is NO LONGER called client-side.
 *   • RowVersion is cached per purchase ID for optimistic concurrency.
 *   • purchaseSummary is fetched from GET /api/purchases/summary.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Injectable, computed, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { CoreStateService } from './core-state.service';
import { PagedResult, Purchase } from './shared-state.interfaces';
import {
  PurchaseDto, PurchaseSummaryDto,
  CreatePurchaseRequest, UpdatePurchaseRequest,
  GetPurchasesParams,
} from '../models/purchase.models';
import { ApiResponse } from '../models/auth.models';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PurchaseService {

  // private readonly api = '/api/purchases';
  private readonly api = `${environment.apiUrl}/purchases`;

  // ── RowVersion cache (purchaseId → base64) ────────────────────────────────
  private _rowVersions = new Map<number, string>();

  // ── Expose signals ────────────────────────────────────────────────────────
  purchases!:       typeof this.core.purchases;
  purchaseSummary!: typeof this.core.purchaseSummary;

  constructor(
    private core: CoreStateService,
    private http: HttpClient,
  ) {
    this.purchases       = this.core.purchases;
    this.purchaseSummary = this.core.purchaseSummary;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // READ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/purchases
   * Fetches all purchases, populates CoreStateService._purchases signal.
   * Returns Observable<Purchase[]> for backward compatibility.
   */
  // getPurchases(): Observable<Purchase[]> {
  //   return this.http
  //     .get<ApiResponse<PurchaseDto[]>>(this.api)
  //     .pipe(
  //       map(res => {
  //         if (!res.success || !res.data)
  //           throw new Error(res.message ?? 'Failed to load purchases.');
  //         return res.data;
  //       }),
  //       tap(dtos => {
  //         dtos.forEach(d => this._rowVersions.set(d.id, d.rowVersion));
  //         this.core._purchases.set(dtos.map(d => this._dtoToPurchase(d)));
  //       }),
  //       map(dtos => dtos.map(d => this._dtoToPurchase(d))),
  //       catchError(err => throwError(() => this._extractError(err))),
  //     );
  // }

  getPurchases(params?: GetPurchasesParams): Observable<PagedResult<Purchase>> {
    let httpParams = new HttpParams();
    if (params?.status)                httpParams = httpParams.set('status',     params.status);
    if (params?.supplierId != null)    httpParams = httpParams.set('supplierId', String(params.supplierId));
    if (params?.search)                httpParams = httpParams.set('search',     params.search);
    if (params?.dateFrom)              httpParams = httpParams.set('dateFrom',   params.dateFrom);
    if (params?.dateTo)                httpParams = httpParams.set('dateTo',     params.dateTo);
    if (params?.page     != null)      httpParams = httpParams.set('page',       String(params.page));
    if (params?.pageSize != null)      httpParams = httpParams.set('pageSize',   String(params.pageSize));

    return this.http
      .get<ApiResponse<PagedResult<PurchaseDto>>>(this.api, { params: httpParams })
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load purchases.');
          return res.data;
        }),
        tap(paged => {
          paged.items.forEach(d => this._rowVersions.set(d.id, d.rowVersion));
          this.core._purchases.set(paged.items.map(d => this._dtoToPurchase(d)));
        }),
        map(paged => ({
          ...paged,
          items: paged.items.map(d => this._dtoToPurchase(d)),
        })),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  /**
   * GET /api/purchases/summary
   * Returns live KPI summary. Called on page load and after mutations.
   * Also patches CoreStateService._purchaseSummary so the signal is live.
   */
  getPurchaseSummary(): Observable<{ totalThisMonth: number; creditPending: number; purchaseCount: number }> {
    return this.http
      .get<ApiResponse<PurchaseSummaryDto>>(`${this.api}/summary`)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load purchase summary.');
          return res.data;
        }),
        tap(dto => {
          // Patch core signal so any computed() that reads purchaseSummary updates
          this.core._purchaseSummaryOverride.set({
            totalThisMonth: dto.totalThisMonth,
            creditPending:  dto.creditPending,
            purchaseCount:  dto.purchaseCount,
          });
        }),
        map(dto => ({
          totalThisMonth: dto.totalThisMonth,
          creditPending:  dto.creditPending,
          purchaseCount:  dto.purchaseCount,
        })),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WRITE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/purchases
   * Creates a purchase. The API SP also adjusts inventory stock server-side.
   */
  createPurchase(data: Omit<Purchase, 'id' | 'createdAt'>): Observable<Purchase> {
    const payload: CreatePurchaseRequest = {
      supplierId:    data.supplierId,
      supplierName:  data.supplierName,
      items:         data.items.map(i => ({
        productId:    i.productId,
        productName:  i.productName,
        quantity:     i.quantity,
        pricePerUnit: i.pricePerUnit,
        total:        i.total,
      })),
      grandTotal:    data.grandTotal,
      paidAmount:    data.paidAmount,
      balance:       data.balance,
      paymentStatus: data.paymentStatus,
      notes:         data.notes,
    };

    return this.http
      .post<ApiResponse<PurchaseDto>>(this.api, payload)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to create purchase.');
          return res.data;
        }),
        tap(dto => {
          this._rowVersions.set(dto.id, dto.rowVersion);
          const purchase = this._dtoToPurchase(dto);
          this.core._purchases.update(list => [purchase, ...list]);
        }),
        map(dto => this._dtoToPurchase(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  /**
   * PUT /api/purchases/{id}
   * Sends RowVersion for concurrency control.
   */
  updatePurchase(id: number, data: Partial<Purchase>): Observable<Purchase> {
    const rowVersion = this._rowVersions.get(id) ?? '';
    const payload: UpdatePurchaseRequest = {
      supplierId:    data.supplierId    ?? 0,
      supplierName:  data.supplierName  ?? '',
      items:         (data.items ?? []).map(i => ({
        productId:    i.productId,
        productName:  i.productName,
        quantity:     i.quantity,
        pricePerUnit: i.pricePerUnit,
        total:        i.total,
      })),
      grandTotal:    data.grandTotal    ?? 0,
      paidAmount:    data.paidAmount    ?? 0,
      balance:       data.balance       ?? 0,
      paymentStatus: data.paymentStatus ?? 'Paid',
      notes:         data.notes,
      rowVersion,
    };

    return this.http
      .put<ApiResponse<PurchaseDto>>(`${this.api}/${id}`, payload)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to update purchase.');
          return res.data;
        }),
        tap(dto => {
          this._rowVersions.set(dto.id, dto.rowVersion);
          const updated = this._dtoToPurchase(dto);
          this.core._purchases.update(list =>
            list.map(p => p.id === updated.id ? updated : p));
        }),
        map(dto => this._dtoToPurchase(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  /**
   * PATCH /api/purchases/{id}/mark-paid
   */
  markPurchasePaid(purchaseId: number): Observable<Purchase> {
    return this.http
      .patch<ApiResponse<PurchaseDto>>(`${this.api}/${purchaseId}/mark-paid`, {})
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to mark purchase as paid.');
          return res.data;
        }),
        tap(dto => {
          this._rowVersions.set(dto.id, dto.rowVersion);
          const updated = this._dtoToPurchase(dto);
          this.core._purchases.update(list =>
            list.map(p => p.id === updated.id ? updated : p));
        }),
        map(dto => this._dtoToPurchase(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // ── Signal accessor (for SharedStateService facade) ───────────────────────
  getPurchasesSignal() { return this.core._purchases; }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE — DTO ↔ Purchase model conversion
  // ══════════════════════════════════════════════════════════════════════════

  private _dtoToPurchase(dto: PurchaseDto): Purchase {
    return {
      id:            dto.id,
      supplierId:    dto.supplierId,
      supplierName:  dto.supplierName,
      items:         dto.items.map(i => ({
        productId:    i.productId,
        productName:  i.productName,
        quantity:     i.quantity,
        pricePerUnit: i.pricePerUnit,
        total:        i.total,
      })),
      grandTotal:    dto.grandTotal,
      paidAmount:    dto.paidAmount,
      balance:       dto.balance,
      paymentStatus: dto.paymentStatus,
      notes:         dto.notes,
      createdAt:     new Date(dto.createdAt),
      updatedAt:     dto.updatedAt ? new Date(dto.updatedAt) : undefined,
    };
  }

  private _extractError(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      const msg = err.error?.message;
      if (typeof msg === 'string' && msg.length > 0) return new Error(msg);
      if (err.status === 0)   return new Error('Cannot reach server. Check your connection.');
      if (err.status === 401) return new Error('Session expired. Please log in again.');
      if (err.status === 403) return new Error('You do not have permission to manage purchases.');
      if (err.status === 409) return new Error('This purchase was modified by someone else. Please refresh.');
      if (err.status === 500) return new Error('Server error. Please try again later.');
    }
    if (err instanceof Error) return err;
    return new Error('An unexpected error occurred.');
  }
}
