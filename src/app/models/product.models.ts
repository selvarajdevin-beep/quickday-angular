// models/product.models.ts
// ─────────────────────────────────────────────────────────────────────────────
// Client-side models mirroring the C# ProductDto / request classes exactly.
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors ProductDto.cs — returned by all Product API responses */
export interface ProductDto {
  id:                number;
  businessAccountId: number;
  name:              string;
  unitType:          string;
  capacity:          string;
  category:          string;
  sellingPrice:      number;
  purchasePrice:     number;
  currentStock:      number;
  minStockAlert:     number;
  active:            boolean;
  totalOrders:       number;
  createdAt:         string;
  updatedAt?:        string;
  /** Base64 RowVersion — must be sent back on UPDATE */
  rowVersion:        string;
}

/** Mirrors ProductSummaryDto.cs */
export interface ProductSummaryDto {
  totalProducts: number;
  activeCount:   number;
  inactiveCount: number;
  lowStockCount: number;
  categoryCount: number;
}

/** Mirrors InventoryLogDto.cs */
export interface InventoryLogDto {
  id:          number;
  productId:   number;
  productName: string;
  type:        'IN' | 'OUT';
  quantity:    number;
  reason:      string;
  reference?:  string;
  date:        string;
}

// ── Request payloads ──────────────────────────────────────────────────────────

export interface CreateProductRequest {
  name:          string;
  unitType:      string;
  capacity?:     string;
  category?:     string;
  sellingPrice:  number;
  purchasePrice: number;
  minStockAlert: number;
  active:        boolean;
}

export interface UpdateProductRequest extends CreateProductRequest {
  rowVersion: string;   // required for optimistic concurrency
}

export interface AdjustStockRequest {
  quantity:   number;
  type:       'IN' | 'OUT';
  reason:     string;
  reference?: string;
}

export interface UpdateMinStockAlertRequest {
  minStockAlert: number;
}

export interface GetProductsParams {
  activeOnly?: boolean;
  category?:   string;
  search?:     string;
  lowStockOnly?: boolean;
  page?:       number;
  pageSize?:   number;
}