/**
 * SupplierService
 * ─────────────────────────────────────────────────────────────────────────────
 * All operations now hit the real API:
 *   GET    /api/suppliers                      → getSuppliers()
 *   GET    /api/suppliers/{id}                 → getSupplierById()
 *   POST   /api/suppliers                      → createSupplier()
 *   PUT    /api/suppliers/{id}                 → updateSupplier()
 *   PATCH  /api/suppliers/{id}/toggle-status   → toggleSupplierStatus()
 *   GET    /api/suppliers/{id}/purchases       → getPurchasesBySupplier()
 *   POST   /api/suppliers/{id}/payment         → recordSupplierPayment()
 *
 * Signal contract is identical — SharedStateService.suppliers and
 * CoreStateService._supplierBase / _purchases signals stay in sync.
 *
 * The Supplier interface in shared-state.interfaces.ts includes
 * computed aggregate fields (totalAmount, amountDue, lastPurchaseDate)
 * that previously came from joining _supplierBase + _purchases in a
 * CoreStateService computed().  These now come pre-computed from the
 * API so no local join is needed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Injectable, computed, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { CoreStateService } from './core-state.service';
import { Supplier, Purchase, PagedResult } from './shared-state.interfaces';
import {
  SupplierDto, PurchaseDto, PurchaseItemDto,
  CreateSupplierRequest, UpdateSupplierRequest,
  RecordSupplierPaymentRequest,
  GetSuppliersParams,
} from '../models/supplier.models';
import { ApiResponse } from '../models/auth.models';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupplierService {

  // private readonly api = '/api/suppliers';
  private readonly api = `${environment.apiUrl}/suppliers`;

  // ── RowVersion cache (supplierId → base64) ────────────────────────────────
  private _rowVersions = new Map<number, string>();

  // ── Expose signals ────────────────────────────────────────────────────────
  // suppliers is now a plain signal (not a computed from _supplierBase +
  // _purchases) because the API returns pre-aggregated SupplierDtos.
  // CoreStateService._suppliers is a new writable signal added below.
  suppliers!:        typeof this.core.suppliers;
  totalSupplierDue!: typeof this.core.totalSupplierDue;

  constructor(
    private core: CoreStateService,
    private http: HttpClient,
  ) {
    this.suppliers        = this.core.suppliers;
    this.totalSupplierDue = this.core.totalSupplierDue;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // READ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/suppliers
   * Fetches all suppliers, populates CoreStateService._suppliers signal.
   * Returns Observable<Supplier[]> for backward compatibility.
   */
  // getSuppliers(): Observable<Supplier[]> {
  //   return this.http
  //     .get<ApiResponse<SupplierDto[]>>(this.api)
  //     .pipe(
  //       map(res => {
  //         if (!res.success || !res.data)
  //           throw new Error(res.message ?? 'Failed to load suppliers.');
  //         return res.data;
  //       }),
  //       tap(dtos => {
  //         dtos.forEach(d => this._rowVersions.set(d.id, d.rowVersion));
  //         this.core._suppliers.set(dtos.map(d => this._dtoToSupplier(d)));
  //       }),
  //       map(dtos => dtos.map(d => this._dtoToSupplier(d))),
  //       catchError(err => throwError(() => this._extractError(err))),
  //     );
  // }

  getSuppliers(params?: GetSuppliersParams): Observable<PagedResult<Supplier>> {
    let httpParams = new HttpParams();
    if (params?.search)             httpParams = httpParams.set('search',   params.search);
    if (params?.status)             httpParams = httpParams.set('status',   params.status);
    if (params?.page     != null)   httpParams = httpParams.set('page',     String(params.page));
    if (params?.pageSize != null)   httpParams = httpParams.set('pageSize', String(params.pageSize));

    return this.http
      .get<ApiResponse<PagedResult<SupplierDto>>>(this.api, { params: httpParams })
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load suppliers.');
          return res.data;
        }),
        tap(paged => {
          paged.items.forEach(d => this._rowVersions.set(d.id, d.rowVersion));
          this.core._suppliers.set(paged.items.map(d => this._dtoToSupplier(d)));
        }),
        map(paged => ({
          ...paged,
          items: paged.items.map(d => this._dtoToSupplier(d)),
        })),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WRITE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/suppliers
   */
  createSupplier(data: Partial<Supplier>): Observable<Supplier> {
    const payload: CreateSupplierRequest = {
      name:           data.name    ?? '',
      phone:          data.phone   ?? '',
      email:          data.address || undefined,   // address field not in Supplier interface — handled via formData
      address:        (data as any).address || undefined,
      gstin:          (data as any).gstin   || undefined,
      contactPerson:  (data as any).contactPerson || undefined,
      notes:          (data as any).notes   || undefined,
    };

    // Use the actual typed fields from the partial
    const typed: CreateSupplierRequest = {
      name:          data.name           ?? '',
      phone:         data.phone          ?? '',
      email:         (data as any).email || undefined,
      address:       data.address        || undefined,
      gstin:         (data as any).gstin || undefined,
      contactPerson: (data as any).contactPerson || undefined,
      notes:         (data as any).notes || undefined,
    };

    return this.http
      .post<ApiResponse<SupplierDto>>(this.api, typed)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to create supplier.');
          return res.data;
        }),
        tap(dto => {
          this._rowVersions.set(dto.id, dto.rowVersion);
          const supplier = this._dtoToSupplier(dto);
          this.core._suppliers.update(list => [supplier, ...list]);
        }),
        map(dto => this._dtoToSupplier(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  /**
   * PUT /api/suppliers/{id}
   */
  updateSupplier(id: number, data: Partial<Supplier>): Observable<Supplier> {
    const rowVersion = this._rowVersions.get(id) ?? '';
    const payload: UpdateSupplierRequest = {
      name:          data.name           ?? '',
      phone:         data.phone          ?? '',
      email:         (data as any).email || undefined,
      address:       data.address        || undefined,
      gstin:         (data as any).gstin || undefined,
      contactPerson: (data as any).contactPerson || undefined,
      notes:         (data as any).notes || undefined,
      active:        data.active         ?? false,
      rowVersion,
    };

    return this.http
      .put<ApiResponse<SupplierDto>>(`${this.api}/${id}`, payload)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to update supplier.');
          return res.data;
        }),
        tap(dto => {
          this._rowVersions.set(dto.id, dto.rowVersion);
          const updated = this._dtoToSupplier(dto);
          this.core._suppliers.update(list =>
            list.map(s => s.id === updated.id ? updated : s));
        }),
        map(dto => this._dtoToSupplier(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  /**
   * PATCH /api/suppliers/{id}/toggle-status
   */
  toggleSupplierStatus(id: number): Observable<Supplier> {
    return this.http
      .patch<ApiResponse<SupplierDto>>(`${this.api}/${id}/toggle-status`, {})
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to update supplier status.');
          return res.data;
        }),
        tap(dto => {
          this._rowVersions.set(dto.id, dto.rowVersion);
          const updated = this._dtoToSupplier(dto);
          this.core._suppliers.update(list =>
            list.map(s => s.id === updated.id ? updated : s));
        }),
        map(dto => this._dtoToSupplier(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  /**
   * GET /api/suppliers/{id}/purchases?maxRows=5
   */
  getPurchasesBySupplier(supplierId: number): Observable<Purchase[]> {
    return this.http
      .get<ApiResponse<PurchaseDto[]>>(
        `${this.api}/${supplierId}/purchases?maxRows=5`)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load purchases.');
          return res.data;
        }),
        map(dtos => dtos.map(d => this._dtoPurchaseToModel(d))),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  /**
   * POST /api/suppliers/{id}/payment
   * Returns the updated supplier (with recalculated amountDue).
   */
  recordSupplierPayment(supplierId: number, amount: number): Observable<void> {
    const payload: RecordSupplierPaymentRequest = { amount };

    return this.http
      .post<ApiResponse<SupplierDto>>(`${this.api}/${supplierId}/payment`, payload)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to record payment.');
          return res.data;
        }),
        tap(dto => {
          // Update the supplier in the signal with fresh aggregates from DB
          this._rowVersions.set(dto.id, dto.rowVersion);
          const updated = this._dtoToSupplier(dto);
          this.core._suppliers.update(list =>
            list.map(s => s.id === updated.id ? updated : s));
        }),
        map(() => void 0),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // ── Signal accessor (for SharedStateService facade) ───────────────────────
  getSuppliersSignal() { return this.core._suppliers; }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE — DTO ↔ model conversion
  // ══════════════════════════════════════════════════════════════════════════

  private _dtoToSupplier(dto: SupplierDto): Supplier {
    return {
      id:               dto.id,
      name:             dto.name,
      phone:            dto.phone,
      address:          dto.address,
      active:           dto.active,
      totalPurchases:   dto.totalPurchases,
      totalAmount:      dto.totalAmount,
      amountDue:        dto.amountDue,
      lastPurchaseDate: dto.lastPurchaseDate ? new Date(dto.lastPurchaseDate) : null,
      createdAt:        new Date(dto.createdAt),
    };
  }

  private _dtoPurchaseToModel(dto: PurchaseDto): Purchase {
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
    };
  }

  private _extractError(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      const msg = err.error?.message;
      if (typeof msg === 'string' && msg.length > 0) return new Error(msg);
      if (err.status === 0)   return new Error('Cannot reach server. Check your connection.');
      if (err.status === 401) return new Error('Session expired. Please log in again.');
      if (err.status === 403) return new Error('You do not have permission to manage suppliers.');
      if (err.status === 409) return new Error('This record was modified by someone else. Please refresh.');
      if (err.status === 500) return new Error('Server error. Please try again later.');
    }
    if (err instanceof Error) return err;
    return new Error('An unexpected error occurred.');
  }
}
