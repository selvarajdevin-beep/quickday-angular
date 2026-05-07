import { Injectable, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { CoreStateService } from './core-state.service';
import { Product, InventoryLog, PagedResult } from './shared-state.interfaces';
import {
  ProductDto, InventoryLogDto,
  CreateProductRequest, UpdateProductRequest,
  AdjustStockRequest, UpdateMinStockAlertRequest,
} from '../models/product.models';
import { ApiResponse } from '../models/auth.models';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class InventoryService {

  // private readonly api = '/api/inventory';
  private readonly api = `${environment.apiUrl}/inventory`;

  // Expose signals
  invLogs!:       typeof this.core.invLogs;
  products!:      typeof this.core.products;
  lowStockItems!: typeof this.core.lowStockItems;
  lowStockCount!: typeof this.core.lowStockCount;

  constructor(
    private core: CoreStateService,
    private http: HttpClient,
  ) {
    this.invLogs       = this.core.invLogs;
    this.products      = this.core.products;
    this.lowStockItems = this.core.lowStockItems;
    this.lowStockCount = this.core.lowStockCount;
  }

  // ── READ ──────────────────────────────────────────────────────────────────

  /**
   * GET /api/inventory/logs?from=&to=
   * Populates CoreStateService._invLogs.
   * InventoryComponent calls this on init with its current date range.
   */
  // getInventoryLogs(from?: string, to?: string): Observable<InventoryLog[]> {
  //   let url = `${this.api}/logs`;
  //   const params: string[] = [];
  //   if (from) params.push(`from=${from}`);
  //   if (to)   params.push(`to=${to}`);
  //   if (params.length) url += `?${params.join('&')}`;

  //   return this.http
  //     .get<ApiResponse<InventoryLogDto[]>>(url)
  //     .pipe(
  //       map(res => {
  //         if (!res.success || !res.data)
  //           throw new Error(res.message ?? 'Failed to load inventory logs.');
  //         return res.data;
  //       }),
  //       tap(dtos => {
  //         this.core._invLogs.set(dtos.map(d => this._dtoToLog(d)));
  //       }),
  //       map(dtos => dtos.map(d => this._dtoToLog(d))),
  //       catchError(err => throwError(() => this._extractError(err))),
  //     );
  // }

  getInventoryLogs(
    from?: string, to?: string, search?: string,
    page = 1, pageSize = 10
  ): Observable<PagedResult<InventoryLog>> {
    const params: string[] = [];
    if (from)     params.push(`from=${from}`);
    if (to)       params.push(`to=${to}`);
    if (search)   params.push(`search=${encodeURIComponent(search)}`);
    params.push(`page=${page}`);
    params.push(`pageSize=${pageSize}`);

    const url = `${this.api}/logs?${params.join('&')}`;

    return this.http
      .get<ApiResponse<PagedResult<InventoryLogDto>>>(url)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load inventory logs.');
          return res.data;
        }),
        tap(paged => {
          this.core._invLogs.set(paged.items.map(d => this._dtoToLog(d)));
        }),
        map(paged => ({
          ...paged,
          items: paged.items.map(d => this._dtoToLog(d)),
        })),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // ── WRITE ─────────────────────────────────────────────────────────────────

  /**
   * POST /api/inventory/{productId}/adjust
   * Adjusts stock server-side. SP validates qty ≤ currentStock for OUT.
   * Returns the updated Product — patches _products signal immediately.
   * Also refreshes logs for the current date window.
   */
  adjustStock(
    productId: number,
    qty: number,
    type: 'IN' | 'OUT',
    reason: string,
    reference?: string,
  ): Observable<void> {
    const payload: AdjustStockRequest = {
      quantity:  qty,
      type,
      reason,
      reference: reference || undefined,
    };

    return this.http
      .post<ApiResponse<ProductDto>>(
        `${this.api}/${productId}/adjust`, payload)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to adjust stock.');
          return res.data;
        }),
        tap(dto => {
          // Patch the product in the signal with fresh DB stock value
          const updated = {
            id:            dto.id,
            name:          dto.name,
            unitType:      dto.unitType,
            capacity:      dto.capacity,
            category:      dto.category,
            sellingPrice:  dto.sellingPrice,
            purchasePrice: dto.purchasePrice,
            active:        dto.active,
            totalOrders:   dto.totalOrders,
            currentStock:  dto.currentStock,
            minStockAlert: dto.minStockAlert,
          } as Product;
          this.core._products.update(list =>
            list.map(p => p.id === updated.id ? updated : p));

          // Append a synthetic log entry to _invLogs so the log tab
          // reflects the adjustment without a full reload
          const logEntry: InventoryLog = {
            id:          Date.now() + Math.random(),
            productId:   dto.id,
            productName: dto.name,
            type,
            quantity:    qty,
            reason,
            reference,
            date:        new Date(),
          };
          this.core._invLogs.update(list => [logEntry, ...list]);
        }),
        map(() => void 0),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  /**
   * PATCH /api/inventory/{productId}/min-stock
   */
  updateMinStockAlert(productId: number, min: number): Observable<void> {
    const payload: UpdateMinStockAlertRequest = { minStockAlert: min };

    return this.http
      .patch<ApiResponse<ProductDto>>(
        `${this.api}/${productId}/min-stock`, payload)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to update alert threshold.');
          return res.data;
        }),
        tap(dto => {
          this.core._products.update(list =>
            list.map(p => p.id === dto.id
              ? { ...p, minStockAlert: dto.minStockAlert }
              : p));
        }),
        map(() => void 0),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // ── Conversion ────────────────────────────────────────────────────────────

  private _dtoToLog(dto: InventoryLogDto): InventoryLog {
    return {
      id:          dto.id,
      productId:   dto.productId,
      productName: dto.productName,
      type:        dto.type as 'IN' | 'OUT',
      quantity:    dto.quantity,
      reason:      dto.reason,
      reference:   dto.reference,
      date:        new Date(dto.date),
    };
  }

  private _extractError(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      const msg = err.error?.message;
      if (typeof msg === 'string' && msg.length > 0) return new Error(msg);
      if (err.status === 0)   return new Error('Cannot reach server. Check your connection.');
      if (err.status === 401) return new Error('Session expired. Please log in again.');
      if (err.status === 403) return new Error('You do not have permission to manage inventory.');
      if (err.status === 500) return new Error('Server error. Please try again later.');
    }
    if (err instanceof Error) return err;
    return new Error('An unexpected error occurred.');
  }
}
