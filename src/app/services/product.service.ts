/**
 * ProductService
 * ─────────────────────────────────────────────────────────────────────────────
 * All operations hit the real API:
 *   GET    /api/products                    → getProducts()
 *   GET    /api/products/summary            → getProductSummary()
 *   GET    /api/products/{id}               → getProductById()
 *   POST   /api/products                    → createProduct()
 *   PUT    /api/products/{id}               → updateProduct()
 *   PATCH  /api/products/{id}/toggle-status → toggleProductStatus()
 *
 * Signal contract:
 *   CoreStateService._products is the single source of truth.
 *   All computed signals (lowStockItems, lowStockCount, activeProducts)
 *   derive from it automatically — no manual refresh needed.
 *
 * RowVersion is cached per product ID for optimistic concurrency.
 *
 * IMPORTANT: Stock adjustments (adjustStock) are done server-side by the
 *   Purchase and Order SPs. This service does NOT adjust stock directly.
 *   After a purchase is created, call getProducts() to re-sync stock values.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { CoreStateService } from './core-state.service';
import { PagedResult, Product } from './shared-state.interfaces';
import {
  ProductDto, ProductSummaryDto,
  CreateProductRequest, UpdateProductRequest,
  GetProductsParams,
} from '../models/product.models';
import { ApiResponse } from '../models/auth.models';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ProductService {

  // private readonly api = '/api/products';
  private readonly api = `${environment.apiUrl}/products`;

  // ── RowVersion cache (productId → base64) ─────────────────────────────────
  private _rowVersions = new Map<number, string>();

  // ── Expose signals (read-only views from CoreStateService) ────────────────
  products!:       typeof this.core.products;
  lowStockItems!:  typeof this.core.lowStockItems;
  lowStockCount!:  typeof this.core.lowStockCount;
  activeProducts!: typeof this.core.activeProducts;
  shopUnitTypes!:  typeof this.core.shopUnitTypes;
  shopCategories!: typeof this.core.shopCategories;

  constructor(
    private core: CoreStateService,
    private http: HttpClient,
  ) {
    this.products       = this.core.products;
    this.lowStockItems  = this.core.lowStockItems;
    this.lowStockCount  = this.core.lowStockCount;
    this.activeProducts = this.core.activeProducts;
    this.shopUnitTypes  = this.core.shopUnitTypes;
    this.shopCategories = this.core.shopCategories;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // READ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/products
   * Fetches all products and populates CoreStateService._products signal.
   * Optional filters are passed as query params — omit to fetch everything.
   */
  // getProducts(options?: { activeOnly?: boolean; category?: string }): Observable<Product[]> {
  //   let params = new HttpParams();
  //   if (options?.activeOnly !== undefined)
  //     params = params.set('activeOnly', String(options.activeOnly));
  //   if (options?.category)
  //     params = params.set('category', options.category);

  //   return this.http
  //     .get<ApiResponse<ProductDto[]>>(this.api, { params })
  //     .pipe(
  //       map(res => {
  //         if (!res.success || !res.data)
  //           throw new Error(res.message ?? 'Failed to load products.');
  //         return res.data;
  //       }),
  //       tap(dtos => {
  //         dtos.forEach(d => this._rowVersions.set(d.id, d.rowVersion));
  //         this.core._products.set(dtos.map(d => this._dtoToProduct(d)));
  //       }),
  //       map(dtos => dtos.map(d => this._dtoToProduct(d))),
  //       catchError(err => throwError(() => this._extractError(err))),
  //     );
  // }

  /**
   * GET /api/products/summary
   * Returns live KPI summary. Updates CoreStateService._productSummaryOverride.
   */
  getProductSummary(): Observable<ProductSummaryDto> {
    return this.http
      .get<ApiResponse<ProductSummaryDto>>(`${this.api}/summary`)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load product summary.');
          return res.data;
        }),
        tap(dto => {
          this.core._productSummaryOverride.set(dto);
        }),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  /**
   * GET /api/products/{id}
   * Fetches a single product by ID. Refreshes the cache entry.
   */
  getProductById(id: number): Observable<Product> {
    return this.http
      .get<ApiResponse<ProductDto>>(`${this.api}/${id}`)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load product.');
          return res.data;
        }),
        tap(dto => this._rowVersions.set(dto.id, dto.rowVersion)),
        map(dto => this._dtoToProduct(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  getProducts(params?: GetProductsParams): Observable<PagedResult<Product>> {
    let httpParams = new HttpParams();
    if (params?.activeOnly !== undefined)
      httpParams = httpParams.set('activeOnly', String(params.activeOnly));
    if (params?.category)
      httpParams = httpParams.set('category', params.category);
    if (params?.search)
      httpParams = httpParams.set('search', params.search);
    if (params?.lowStockOnly !== undefined) 
      httpParams = httpParams.set('lowStockOnly', String(params.lowStockOnly));
    if (params?.page !== undefined)
      httpParams = httpParams.set('page',     String(params.page));
    if (params?.pageSize !== undefined)
      httpParams = httpParams.set('pageSize', String(params.pageSize));

    return this.http
      .get<ApiResponse<PagedResult<ProductDto>>>(this.api, { params: httpParams })
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load products.');
          return res.data;
        }),
        tap(paged => {
          paged.items.forEach(d => this._rowVersions.set(d.id, d.rowVersion));
          this.core._products.set(paged.items.map(d => this._dtoToProduct(d)));
        }),
        map(paged => ({
          ...paged,
          items: paged.items.map(d => this._dtoToProduct(d)),
        })),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WRITE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/products
   * Creates a product. Prepends the new product to the _products signal.
   */
  createProduct(data: Partial<Product>): Observable<Product> {
    const payload: CreateProductRequest = {
      name:          data.name          ?? '',
      unitType:      data.unitType      ?? '',
      capacity:      data.capacity      || undefined,
      category:      data.category      || undefined,
      sellingPrice:  data.sellingPrice  ?? 0,
      purchasePrice: data.purchasePrice ?? 0,
      minStockAlert: data.minStockAlert ?? 10,
      active:        data.active        ?? true,
    };

    return this.http
      .post<ApiResponse<ProductDto>>(this.api, payload)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to create product.');
          return res.data;
        }),
        tap(dto => {
          this._rowVersions.set(dto.id, dto.rowVersion);
          const product = this._dtoToProduct(dto);
          this.core._products.update(list => [product, ...list]);
        }),
        map(dto => this._dtoToProduct(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  /**
   * PUT /api/products/{id}
   * Sends RowVersion for concurrency control.
   */
  updateProduct(id: number, data: Partial<Product>): Observable<Product> {
    const rowVersion = this._rowVersions.get(id) ?? '';
    const payload: UpdateProductRequest = {
      name:          data.name          ?? '',
      unitType:      data.unitType      ?? '',
      capacity:      data.capacity      || undefined,
      category:      data.category      || undefined,
      sellingPrice:  data.sellingPrice  ?? 0,
      purchasePrice: data.purchasePrice ?? 0,
      minStockAlert: data.minStockAlert ?? 10,
      active:        data.active        ?? true,
      rowVersion,
    };

    return this.http
      .put<ApiResponse<ProductDto>>(`${this.api}/${id}`, payload)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to update product.');
          return res.data;
        }),
        tap(dto => {
          this._rowVersions.set(dto.id, dto.rowVersion);
          const updated = this._dtoToProduct(dto);
          this.core._products.update(list =>
            list.map(p => p.id === updated.id ? updated : p));
        }),
        map(dto => this._dtoToProduct(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  /**
   * PATCH /api/products/{id}/toggle-status
   * Activates or deactivates a product.
   */
  toggleProductStatus(id: number): Observable<Product> {
    return this.http
      .patch<ApiResponse<ProductDto>>(`${this.api}/${id}/toggle-status`, {})
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to update product status.');
          return res.data;
        }),
        tap(dto => {
          this._rowVersions.set(dto.id, dto.rowVersion);
          const updated = this._dtoToProduct(dto);
          this.core._products.update(list =>
            list.map(p => p.id === updated.id ? updated : p));
        }),
        map(dto => this._dtoToProduct(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // ── Signal accessors ──────────────────────────────────────────────────────
  getProductsSignal() { return this.core._products; }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE — DTO ↔ Product model conversion
  // ══════════════════════════════════════════════════════════════════════════

  private _dtoToProduct(dto: ProductDto): Product {
    return {
      id:            dto.id,
      name:          dto.name,
      unitType:      dto.unitType,
      capacity:      dto.capacity,
      category:      dto.category,
      sellingPrice:  dto.sellingPrice,
      purchasePrice: dto.purchasePrice,
      currentStock:  dto.currentStock,
      minStockAlert: dto.minStockAlert,
      active:        dto.active,
      totalOrders:   dto.totalOrders,
    };
  }

  private _extractError(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      const msg = err.error?.message;
      if (typeof msg === 'string' && msg.length > 0) return new Error(msg);
      if (err.status === 0)   return new Error('Cannot reach server. Check your connection.');
      if (err.status === 401) return new Error('Session expired. Please log in again.');
      if (err.status === 403) return new Error('You do not have permission to manage products.');
      if (err.status === 409) return new Error('This product was modified by someone else. Please refresh.');
      if (err.status === 500) return new Error('Server error. Please try again later.');
    }
    if (err instanceof Error) return err;
    return new Error('An unexpected error occurred.');
  }
}
