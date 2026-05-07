/**
 * OrderService — UPDATED
 * ─────────────────────────────────────────────────────────────────────────────
 * Fix: getOrders() now passes `status` and `search` params to the API
 *      so the status filter buttons (All / Paid / Credit / Partial) and
 *      the search box actually filter on the server side.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

import { CoreStateService }  from './core-state.service';
import { CustomerService }   from './customer.service';
import { Order, PaymentRecord, PagedResult, OrderDashboardSummary } from './shared-state.interfaces';
import {
  OrderDto, PaymentDto, TodaySummaryDto,
  GetOrdersParams,
  CreateOrderRequest, UpdateOrderRequest, RecordPaymentRequest,
  OrderItemRequest,
  OrderHistoryResult,
  OrderHistoryApiResult,
} from '../models/order.models';
import { ApiResponse } from '../models/auth.models';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class OrderService {

  // private readonly api = '/api/orders';
  private readonly api = `${environment.apiUrl}/orders`;

  private _rowVersions = new Map<number, string>();

  orders!:   typeof this.core.orders;
  payments!: typeof this.core.payments;

  constructor(
    private core:        CoreStateService,
    private customerSvc: CustomerService,
    private http:        HttpClient,
  ) {
    this.orders   = this.core.orders;
    this.payments = this.core.payments;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // READ — PAGED (used by Billing orders tab)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/orders
   * Passes: from, to, status, search, page, pageSize
   * All params are optional — omitted params are ignored by the API.
   */
  getOrders(params?: GetOrdersParams): Observable<PagedResult<Order>> {
    let httpParams = new HttpParams();

    if (params?.from)                          httpParams = httpParams.set('from',     params.from);
    if (params?.to)                            httpParams = httpParams.set('to',       params.to);
    if (params?.status && params.status !== 'all')
                                               httpParams = httpParams.set('status',   params.status);
    if (params?.search && params.search.trim()) httpParams = httpParams.set('search',  params.search.trim());
    if (params?.page     != null)              httpParams = httpParams.set('page',     String(params.page));
    if (params?.pageSize != null)              httpParams = httpParams.set('pageSize', String(params.pageSize));

    return this.http.get<ApiResponse<PagedResult<OrderDto>>>(this.api, { params: httpParams }).pipe(
      map(res => {
        if (!res.success || !res.data) throw new Error(res.message ?? 'Failed to load orders.');
        return res.data;
      }),
      tap(paged => {
        paged.items.forEach(d => this._rowVersions.set(d.id, d.rowVersion));
        this.core._orders.set(paged.items.map(d => this._dtoToOrder(d)));
      }),
      map(paged => ({ ...paged, items: paged.items.map(d => this._dtoToOrder(d)) })),
      catchError(err => throwError(() => this._extractError(err))),
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // READ — FULL (Dashboard / Reports — no pagination, no filters)
  // ══════════════════════════════════════════════════════════════════════════

  getOrdersAll(from?: string, to?: string): Observable<Order[]> {
    let httpParams = new HttpParams().set('page', '1').set('pageSize', '9999');
    if (from) httpParams = httpParams.set('from', from);
    if (to)   httpParams = httpParams.set('to',   to);

    return this.http.get<ApiResponse<PagedResult<OrderDto>>>(this.api, { params: httpParams }).pipe(
      map(res => {
        if (!res.success || !res.data) throw new Error(res.message ?? 'Failed to load orders.');
        return res.data.items;
      }),
      tap(dtos => {
        dtos.forEach(d => this._rowVersions.set(d.id, d.rowVersion));
        this.core._orders.set(dtos.map(d => this._dtoToOrder(d)));
      }),
      map(dtos => dtos.map(d => this._dtoToOrder(d))),
      catchError(err => throwError(() => this._extractError(err))),
    );
  }

  // GET /api/orders/today-summary
  getTodaySummary(): Observable<TodaySummaryDto> {
    return this.http.get<ApiResponse<TodaySummaryDto>>(`${this.api}/today-summary`).pipe(
      map(res => {
        if (!res.success || !res.data) throw new Error(res.message ?? 'Failed to load summary.');
        return res.data;
      }),
      tap(dto => {
        this.core._todaySummaryOverride.set({
          todaySales:     dto.todaySales,
          todayOrders:    dto.todayOrders,
          cashAmount:     dto.cashAmount,
          upiAmount:      dto.upiAmount,
          creditAmount:   dto.creditAmount,
          totalCustomers: this.core._customers().filter(c => c.active).length,
          creditPending:  this.core.totalCreditPending(),
        });
      }),
      catchError(err => throwError(() => this._extractError(err))),
    );
  }

  // GET /api/orders/dashboard-summary?from=YYYY-MM-DD
  getOrdersDashboardSummary(from?: string): Observable<OrderDashboardSummary> {
    const params = from ? new HttpParams({ fromObject: { from } }) : undefined;
    return this.http
      .get<ApiResponse<OrderDashboardSummary>>(`${this.api}/dashboard-summary`, { params })
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load order summary.');
          return res.data;
        }),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // GET /api/orders/by-customer/{id}?page=&pageSize=
  getOrdersByCustomer(
    customerId: number,
    page     = 1,
    pageSize = 10,
  ): Observable<PagedResult<Order>> {
    const params = new HttpParams()
      .set('page',     String(page))
      .set('pageSize', String(pageSize));

    return this.http
      .get<ApiResponse<PagedResult<OrderDto>>>(
        `${this.api}/by-customer/${customerId}`, { params })
      .pipe(
        map(res => {
          if (!res.success || !res.data) throw new Error(res.message ?? 'Failed to load orders.');
          return res.data;
        }),
        tap(paged => paged.items.forEach(d => this._rowVersions.set(d.id, d.rowVersion))),
        map(paged => ({ ...paged, items: paged.items.map(d => this._dtoToOrder(d)) })),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // GET /api/orders/payments/by-customer/{id}?page=&pageSize=
  getPaymentsByCustomer(
    customerId: number,
    page     = 1,
    pageSize = 10,
  ): Observable<PagedResult<PaymentRecord>> {
    const params = new HttpParams()
      .set('page',     String(page))
      .set('pageSize', String(pageSize));

    return this.http
      .get<ApiResponse<PagedResult<PaymentDto>>>(
        `${this.api}/payments/by-customer/${customerId}`, { params })
      .pipe(
        map(res => {
          if (!res.success || !res.data) throw new Error(res.message ?? 'Failed to load payments.');
          return res.data;
        }),
        map(paged => ({ ...paged, items: paged.items.map(d => this._dtoToPayment(d)) })),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WRITE
  // ══════════════════════════════════════════════════════════════════════════

  createOrder(data: Omit<Order, 'id' | 'createdAt'>): Observable<Order> {
    const payload: CreateOrderRequest = {
      customerId:    data.customerId,
      customerName:  data.customerName,
      items:         data.items.map(i => ({ ...i }) as OrderItemRequest),
      grandTotal:    data.grandTotal,
      paidAmount:    data.paidAmount,
      balance:       data.balance,
      paymentType:   data.paymentType as 'Cash' | 'UPI' | 'Credit',
      status:        data.status      as 'Paid' | 'Partial' | 'Credit',
      deliveryNote:  data.deliveryNote,
      subTotal:      (data as any).subTotal      ?? data.grandTotal,
      taxableAmount: (data as any).taxableAmount ?? data.grandTotal,
      gstType:       (data as any).gstType       ?? 'None',
      cgstRate:      (data as any).cgstRate      ?? 0,
      sgstRate:      (data as any).sgstRate      ?? 0,
      igstRate:      (data as any).igstRate      ?? 0,
      cgstAmount:    (data as any).cgstAmount    ?? 0,
      sgstAmount:    (data as any).sgstAmount    ?? 0,
      igstAmount:    (data as any).igstAmount    ?? 0,
      totalGst:      (data as any).totalGst      ?? 0,
    };

    return this.http.post<ApiResponse<OrderDto>>(this.api, payload).pipe(
      map(res => {
        if (!res.success || !res.data) throw new Error(res.message ?? 'Failed to save order.');
        return res.data;
      }),
      tap(dto => {
        this._rowVersions.set(dto.id, dto.rowVersion);
        const order = this._dtoToOrder(dto);
        this.core._orders.update(list => [order, ...list]);
      }),
      map(dto => this._dtoToOrder(dto)),
      switchMap(order =>
        this.customerSvc.getCustomers().pipe(
          catchError(() => of([])),
          map(() => order),
        )
      ),
      catchError(err => throwError(() => this._extractError(err))),
    );
  }

  updateOrder(id: number, data: Partial<Order>): Observable<Order> {
    const rowVersion = this._rowVersions.get(id) ?? '';
    const payload: UpdateOrderRequest = {
      customerId:    data.customerId    ?? 0,
      customerName:  data.customerName  ?? '',
      items:         (data.items ?? []).map(i => ({ ...i }) as OrderItemRequest),
      grandTotal:    data.grandTotal    ?? 0,
      paidAmount:    data.paidAmount    ?? 0,
      balance:       data.balance       ?? 0,
      paymentType:   (data.paymentType  ?? 'Cash')   as 'Cash' | 'UPI' | 'Credit',
      status:        (data.status       ?? 'Paid')   as 'Paid' | 'Partial' | 'Credit',
      deliveryNote:  data.deliveryNote,
      rowVersion,
      subTotal:      (data as any).subTotal      ?? data.grandTotal ?? 0,
      taxableAmount: (data as any).taxableAmount ?? data.grandTotal ?? 0,
      gstType:       (data as any).gstType       ?? 'None',
      cgstRate:      (data as any).cgstRate      ?? 0,
      sgstRate:      (data as any).sgstRate      ?? 0,
      igstRate:      (data as any).igstRate      ?? 0,
      cgstAmount:    (data as any).cgstAmount    ?? 0,
      sgstAmount:    (data as any).sgstAmount    ?? 0,
      igstAmount:    (data as any).igstAmount    ?? 0,
      totalGst:      (data as any).totalGst      ?? 0,
    };

    return this.http.put<ApiResponse<OrderDto>>(`${this.api}/${id}`, payload).pipe(
      map(res => {
        if (!res.success || !res.data) throw new Error(res.message ?? 'Failed to update order.');
        return res.data;
      }),
      tap(dto => {
        this._rowVersions.set(dto.id, dto.rowVersion);
        const updated = this._dtoToOrder(dto);
        this.core._orders.update(list => list.map(o => o.id === updated.id ? updated : o));
      }),
      map(dto => this._dtoToOrder(dto)),
      switchMap(order =>
        this.customerSvc.getCustomers().pipe(
          catchError(() => of([])),
          map(() => order),
        )
      ),
      catchError(err => throwError(() => this._extractError(err))),
    );
  }

  recordPayment(
    customerId:  number,
    amount:      number,
    paymentType: 'Cash' | 'UPI',
    note:        string,
    orderId?:    number,
  ): Observable<PaymentRecord> {
    const payload: RecordPaymentRequest = { amount, paymentType, note, orderId };

    return this.http
      .post<ApiResponse<{ paymentId: number }>>(`${this.api}/payments/${customerId}`, payload)
      .pipe(
        map(res => {
          if (!res.success) throw new Error(res.message ?? 'Failed to record payment.');
          return res.data?.paymentId ?? 0;
        }),
        tap(paymentId => {
          const rec: PaymentRecord = {
            id: paymentId, customerId, orderId,
            amount, paymentType, note, date: new Date(),
          };
          this.core._payments.update(list => [rec, ...list]);
          if (orderId) {
            this.core._orders.update(list =>
              list.map(o => {
                if (o.id !== orderId) return o;
                const newPaid    = Math.min(o.grandTotal, o.paidAmount + amount);
                const newBalance = Math.max(0, o.grandTotal - newPaid);
                const newStatus  = newBalance === 0 ? 'Paid' : newPaid > 0 ? 'Partial' : 'Credit';
                return { ...o, paidAmount: newPaid, balance: newBalance, status: newStatus as any };
              })
            );
          }
        }),
        map(paymentId => ({
          id: paymentId, customerId, orderId,
          amount, paymentType, note, date: new Date(),
        } as PaymentRecord)),
        switchMap(rec =>
          this.customerSvc.getCustomers().pipe(
            catchError(() => of([])),
            map(() => rec),
          )
        ),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  deleteOrder(id: number): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${this.api}/${id}`).pipe(
      tap(() => this.core._orders.update(list => list.filter(o => o.id !== id))),
      map(() => void 0),
      catchError(err => throwError(() => this._extractError(err))),
    );
  }

  getPaymentsByOrder(orderId: number): Observable<PaymentRecord[]> {
    return this.http.get<ApiResponse<PaymentRecord[]>>(
      `${this.api}/payments/by-order/${orderId}`
    ).pipe(
      map(r => r.data ?? []),
      catchError(err => throwError(() => this._extractError(err))),
    );
  }

  shareInvoiceWhatsApp(orderId: number): Observable<any> {
    return this.http.post<ApiResponse<any>>(
      `${this.api}/${orderId}/share-whatsapp`, {}
    ).pipe(map(r => r.data ?? {}));
  }

  recomputeCustomerDues(): void {
    this.customerSvc.getCustomers().subscribe({ error: () => {} });
  }

  getOrdersSignal() { return this.core._orders; }

  getOrdersByCustomerFiltered(
    customerId: number,
    page     = 1,
    pageSize = 25,
    filters?: {
      dateFrom?: string;   // 'YYYY-MM-DD'
      dateTo?:   string;   // 'YYYY-MM-DD'
      search?:   string;
      status?:   string;   // 'Paid' | 'Partial' | 'Credit'
    }
  ): Observable<OrderHistoryResult> {
    const query = new HttpParams({
      fromObject: {
        page:     String(page),
        pageSize: String(pageSize),
        ...(filters?.dateFrom && { dateFrom: filters.dateFrom }),
        ...(filters?.dateTo   && { dateTo:   filters.dateTo }),
        ...(filters?.search   && { search:   filters.search }),
        ...(filters?.status   && { status:   filters.status }),
      },
    });
  
    // ApiResponse wraps OrderHistoryApiResult — items are still DTOs here
    return this.http
      .get<ApiResponse<OrderHistoryApiResult>>(
        `${this.api}/by-customer/${customerId}/history`,
        { params: query }
      )
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load order history.');
  
          const data = res.data;
          return {
            items:      data.items.map(d => this._dtoToOrder(d)),  // ← maps OrderDto → Order
            totalCount: data.totalCount,
            totalPages: data.totalPages,
            page:       data.page,
            pageSize:   data.pageSize,
            hasNext:    data.hasNext,
            hasPrev:    data.hasPrev,
            summary:    data.summary ?? {
              totalOrders: data.totalCount,
              totalSales:  0,
              totalPaid:   0,
              totalDue:    0,
            },
          } as OrderHistoryResult;
        }),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }
  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE
  // ══════════════════════════════════════════════════════════════════════════

  private _dtoToOrder(dto: OrderDto): Order {
    return {
      id:            dto.id,
      customerId:    dto.customerId,
      customerName:  dto.customerName,
      items:         dto.items.map(i => ({ ...i })),
      grandTotal:    dto.grandTotal,
      paidAmount:    dto.paidAmount,
      balance:       dto.balance,
      paymentType:   dto.paymentType as Order['paymentType'],
      status:        dto.status      as Order['status'],
      deliveryNote:  dto.deliveryNote,
      createdAt:     new Date(dto.createdAt),
      updatedAt:     dto.updatedAt ? new Date(dto.updatedAt) : undefined,
      subTotal:      dto.subTotal      ?? dto.grandTotal,
      taxableAmount: dto.taxableAmount ?? dto.grandTotal,
      gstType:       dto.gstType       ?? 'None',
      cgstRate:      dto.cgstRate      ?? 0,
      sgstRate:      dto.sgstRate      ?? 0,
      igstRate:      dto.igstRate      ?? 0,
      cgstAmount:    dto.cgstAmount    ?? 0,
      sgstAmount:    dto.sgstAmount    ?? 0,
      igstAmount:    dto.igstAmount    ?? 0,
      totalGst:      dto.totalGst      ?? 0,
    };
  }

  private _dtoToPayment(dto: PaymentDto): PaymentRecord {
    return {
      id:          dto.id,
      customerId:  dto.customerId,
      orderId:     dto.orderId,
      amount:      dto.amount,
      paymentType: dto.paymentType as 'Cash' | 'UPI',
      note:        dto.note,
      date:        new Date(dto.date),
    };
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