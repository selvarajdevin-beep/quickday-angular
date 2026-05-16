import { Injectable, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { CoreStateService } from './core-state.service';
import { Customer, Product, PagedResult, CustomerSummary } from './shared-state.interfaces';
import {
  CustomerDto,
  CreateCustomerRequest,
  UpdateCustomerRequest,
} from '../models/customer.models';
import { ApiResponse } from '../models/auth.models';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CustomerService {

  private readonly api = `${environment.apiUrl}/customers`;

  private _rowVersions = new Map<number, string>();

  customers!:          typeof this.core.customers;
  totalCreditPending!: typeof this.core.totalCreditPending;

  constructor(
    private core: CoreStateService,
    private http: HttpClient,
  ) {
    this.customers          = this.core.customers;
    this.totalCreditPending = this.core.totalCreditPending;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // READ
  // ══════════════════════════════════════════════════════════════════════════

  getCustomers(params?: {
    page?: number; pageSize?: number;
    search?: string; status?: string; type?: string; hasDue?: boolean;
  }): Observable<PagedResult<Customer> & { summary: CustomerSummary }> {
    const query = new HttpParams({
      fromObject: {
        ...(params?.page     != null && { page:     String(params.page) }),
        ...(params?.pageSize != null && { pageSize: String(params.pageSize) }),
        ...(params?.search               && { search:   params.search }),
        ...(params?.status               && { status:   params.status }),
        ...(params?.type                 && { type:     params.type }),
        ...(params?.hasDue  === true     && { hasDue:   'true' }),
      },
    });

    return this.http
      .get<ApiResponse<PagedResult<CustomerDto> & { summary: CustomerSummary }>>(
        this.api, { params: query })
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load customers.');
          return res.data;
        }),
        tap(paged => {
          paged.items.forEach(d => this._rowVersions.set(d.id, d.rowVersion));
          this.core._customers.set(paged.items.map(d => this._dtoToCustomer(d)));

          // ── Apply full-dataset due total from summary ─────────────────
          // The summary always aggregates ALL customers regardless of the
          // current page filter, so the badge stays accurate.
          if (paged.summary?.totalDueAmount != null) {
            this.core._totalCreditPendingOverride.set(paged.summary.totalDueAmount);
          }
        }),
        map(paged => ({
          ...paged,
          items: paged.items.map(d => this._dtoToCustomer(d)),
          summary: paged.summary ?? {
            totalCount: paged.totalCount,
            activeCount: 0, inactiveCount: 0,
            hotelCount: 0, homeCount: 0,
            customersWithDue: 0, totalDueAmount: 0,
            topDueCustomers: [],
          },
        })),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  getCustomersAll(): Observable<Customer[]> {
    const query = new HttpParams({ fromObject: { page: '1', pageSize: '9999' } });

    return this.http
      .get<ApiResponse<PagedResult<CustomerDto>>>(this.api, { params: query })
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load customers.');
          return res.data.items;
        }),
        tap(dtos => {
          dtos.forEach(d => this._rowVersions.set(d.id, d.rowVersion));
          this.core._customers.set(dtos.map(d => this._dtoToCustomer(d)));
        }),
        map(dtos => dtos.map(d => this._dtoToCustomer(d))),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  /** GET /api/customers/summary — KPI strip only, no rows fetched.
   *  Always writes totalDueAmount into the override signal so the
   *  shell notification badge reflects the full-dataset value.
   */
  getCustomerSummary(): Observable<CustomerSummary> {
    return this.http
      .get<ApiResponse<CustomerSummary>>(`${this.api}/summary`)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load customer summary.');
          return res.data;
        }),
        // ── KEY FIX: write the authoritative total into the override ──────
        tap(summary => {
          this.core._totalCreditPendingOverride.set(summary.totalDueAmount);
        }),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WRITE
  // ══════════════════════════════════════════════════════════════════════════

  createCustomer(data: Partial<Customer>): Observable<Customer> {
    const payload: CreateCustomerRequest = {
      name:                  data.name                  ?? '',
      phone:                 data.phone                 ?? '',
      address:               data.address               || undefined,
      customerType:          (data.customerType         ?? 'Home') as 'Hotel' | 'Home',
      defaultPricePerCan:    data.defaultPricePerCan    ?? 35,
      defaultPriceProductId: data.defaultPriceProductId ?? 1,
      usePriceFromProduct:   data.usePriceFromProduct   ?? false,
    };

    return this.http
      .post<ApiResponse<CustomerDto>>(this.api, payload)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to create customer.');
          return res.data;
        }),
        tap(dto => {
          this._rowVersions.set(dto.id, dto.rowVersion);
          const customer = this._dtoToCustomer(dto);
          this.core._customers.update(list => [customer, ...list]);

          // New customer starts with zero due — just refresh to be safe
          this._refreshCreditPendingBadge();
        }),
        map(dto => this._dtoToCustomer(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  updateCustomer(id: number, data: Partial<Customer>): Observable<Customer> {
    const rowVersion = this._rowVersions.get(id) ?? '';
    const payload: UpdateCustomerRequest = {
      name:                  data.name                  ?? '',
      phone:                 data.phone                 ?? '',
      address:               data.address               || undefined,
      customerType:          (data.customerType         ?? 'Home') as 'Hotel' | 'Home',
      defaultPricePerCan:    data.defaultPricePerCan    ?? 35,
      defaultPriceProductId: data.defaultPriceProductId ?? 1,
      usePriceFromProduct:   data.usePriceFromProduct   ?? false,
      rowVersion,
    };

    return this.http
      .put<ApiResponse<CustomerDto>>(`${this.api}/${id}`, payload)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to update customer.');
          return res.data;
        }),
        tap(dto => {
          this._rowVersions.set(dto.id, dto.rowVersion);
          const updated = this._dtoToCustomer(dto);
          this.core._customers.update(list =>
            list.map(c => c.id === updated.id ? updated : c));

          // totalDue on the returned DTO is authoritative — patch the
          // override so the badge reflects the change immediately.
          this._refreshCreditPendingBadge();
        }),
        map(dto => this._dtoToCustomer(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  toggleCustomerStatus(id: number): Observable<Customer> {
    return this.http
      .patch<ApiResponse<CustomerDto>>(`${this.api}/${id}/toggle-status`, {})
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to update customer status.');
          return res.data;
        }),
        tap(dto => {
          this._rowVersions.set(dto.id, dto.rowVersion);
          const updated = this._dtoToCustomer(dto);
          this.core._customers.update(list =>
            list.map(c => c.id === updated.id ? updated : c));

          this._refreshCreditPendingBadge();
        }),
        map(dto => this._dtoToCustomer(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOCAL HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  recomputeCustomerDues(): void {
    const orders = this.core._orders();
    this.core._customers.update(customers =>
      customers.map(c => ({
        ...c,
        totalDue: orders
          .filter(o => o.customerId === c.id && o.status !== 'Paid')
          .reduce((sum, o) => sum + o.balance, 0),
      }))
    );

    // Keep the badge in sync with the recomputed local dues
    const newTotal = this.core._customers()
      .reduce((s, c) => s + c.totalDue, 0);
    this.core._totalCreditPendingOverride.set(newTotal);
  }

  getEffectivePrice(product: Product, customer: Customer): number {
    if (!customer.usePriceFromProduct && customer.defaultPriceProductId === product.id) {
      return customer.defaultPricePerCan;
    }
    return product.sellingPrice;
  }

  getCustomersSignal() { return this.core._customers; }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Re-fetches /api/customers/summary and writes totalDueAmount into the
   * override signal. Fire-and-forget — errors are non-critical since the
   * badge will self-correct on the next navigation.
   *
   * Called after every mutation that can affect customer dues.
   * Uses getCustomerSummary() which already has the tap to set the override,
   * so no duplicate logic here.
   */
  private _refreshCreditPendingBadge(): void {
    this.getCustomerSummary().subscribe({
      error: () => { /* non-critical */ },
    });
  }

  private _dtoToCustomer(dto: CustomerDto): Customer {
    return {
      id:                    dto.id,
      name:                  dto.name,
      phone:                 dto.phone,
      address:               dto.address,
      customerType:          dto.customerType as Customer['customerType'],
      defaultPricePerCan:    dto.defaultPricePerCan,
      defaultPriceProductId: dto.defaultPriceProductId,
      usePriceFromProduct:   dto.usePriceFromProduct,
      active:                dto.active,
      totalOrders:           dto.totalOrders,
      totalDue:              dto.totalDue,
      lastOrderDate:         dto.lastOrderDate ? new Date(dto.lastOrderDate) : null,
      createdAt:             new Date(dto.createdAt),
    };
  }

  private _extractError(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      const msg = err.error?.message;
      if (typeof msg === 'string' && msg.length > 0) return new Error(msg);
      if (err.status === 0)   return new Error('Cannot reach server. Check your connection.');
      if (err.status === 401) return new Error('Session expired. Please log in again.');
      if (err.status === 403) return new Error('You do not have permission to manage customers.');
      if (err.status === 409) return new Error('This customer was modified by someone else. Please refresh.');
      if (err.status === 500) return new Error('Server error. Please try again later.');
    }
    if (err instanceof Error) return err;
    return new Error('An unexpected error occurred.');
  }
}