/**
 * CustomerService — UPDATED
 * ─────────────────────────────────────────────────────────────────────────────
 * All CRUD operations now call the real API:
 *   GET    /api/customers                      → getCustomers()
 *   POST   /api/customers                      → createCustomer()
 *   PUT    /api/customers/{id}                 → updateCustomer()
 *   PATCH  /api/customers/{id}/toggle-status   → toggleCustomerStatus()
 *
 * Key points:
 *   • _customers starts EMPTY — getCustomers() populates it.
 *   • RowVersion cached per customer ID for optimistic concurrency.
 *   • recomputeCustomerDues() stays as a local computed operation for now
 *     because Orders are not yet migrated to the backend. It still computes
 *     from CoreStateService._orders (which holds mock data until Orders are
 *     migrated). Once Orders are migrated this will be replaced by a
 *     GET /api/customers?refresh=dues call.
 *   • getEffectivePrice() remains pure UI logic — no business logic in it.
 *   • BillingComponent reads svc.customers() which is CoreStateService._customers
 *     — same signal, still reactive, zero component changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */
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

  // private readonly api = '/api/customers';
  private readonly api = `${environment.apiUrl}/customers`;

  // RowVersion cache (customerId → base64)
  private _rowVersions = new Map<number, string>();

  // Expose signals
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

  /**
   * GET /api/customers?page=&pageSize=&search=&status=&type=&hasDue=
   * Returns one page + full-dataset KPI summary.
   * The summary always reflects ALL customers regardless of filters,
   * so the KPI strip (Active / Hotel / Home / Due) is always accurate.
   */
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
        }),
        map(paged => ({
          ...paged,
          items: paged.items.map(d => this._dtoToCustomer(d)),
          // summary is passed through as-is from the API response
          summary: paged.summary ?? {
            totalCount: paged.totalCount,
            activeCount: 0, inactiveCount: 0,
            hotelCount: 0, homeCount: 0,
            customersWithDue: 0, totalDueAmount: 0,
          },
        })),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  /**
   * GET /api/customers?pageSize=9999
   * Fetches all customers without a meaningful page limit.
   * Used by Dashboard KPIs, Reports, and BillingComponent customer dropdown.
   * Does NOT replace the paged _customers signal — that stays for the list page.
   */
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
          // Populate the signal with the full list so billing dropdown works
          this.core._customers.set(dtos.map(d => this._dtoToCustomer(d)));
        }),
        map(dtos => dtos.map(d => this._dtoToCustomer(d))),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // customer.service.ts

  /** GET /api/customers/summary — KPI strip only, no rows fetched */
  getCustomerSummary(): Observable<CustomerSummary> {
    return this.http
      .get<ApiResponse<CustomerSummary>>(`${this.api}/summary`)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load customer summary.');
          return res.data;
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
        }),
        map(dto => this._dtoToCustomer(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOCAL HELPERS (until Orders module is backend-migrated)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Recomputes TotalDue for every customer from the live _orders signal.
   * Called by BillingComponent after every order/payment mutation.
   * This is intentionally local logic — the display value is derived from
   * the orders that are already in memory. When the Orders module is
   * migrated to the backend, this will be replaced by a fresh
   * getCustomers() call which returns DB-authoritative TotalDue values.
   */
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
  }

  /**
   * Returns the effective selling price for a product/customer pair.
   * Pure UI logic — no backend call needed.
   */
  getEffectivePrice(product: Product, customer: Customer): number {
    if (!customer.usePriceFromProduct && customer.defaultPriceProductId === product.id) {
      return customer.defaultPricePerCan;
    }
    return product.sellingPrice;
  }

  // Signal accessor
  getCustomersSignal() { return this.core._customers; }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE — DTO ↔ model conversion
  // ══════════════════════════════════════════════════════════════════════════

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