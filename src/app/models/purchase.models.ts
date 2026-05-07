// models/purchase.models.ts
// ─────────────────────────────────────────────────────────────────────────────
// Client-side models mirroring the C# PurchaseDto / request classes exactly.
// ─────────────────────────────────────────────────────────────────────────────

export interface PurchaseItemDto {
  productId:    number;
  productName:  string;
  quantity:     number;
  pricePerUnit: number;
  total:        number;
}

/** Mirrors PurchaseDto.cs — returned by all Purchase API responses */
export interface PurchaseDto {
  id:                number;
  businessAccountId: number;
  supplierId:        number;
  supplierName:      string;
  items:             PurchaseItemDto[];
  grandTotal:        number;
  paidAmount:        number;
  balance:           number;
  paymentStatus:     'Paid' | 'Credit';
  notes?:            string;
  createdAt:         string;
  updatedAt?:        string;
  /** Base64 RowVersion — must be sent back on UPDATE */
  rowVersion:        string;
}

/** Mirrors PurchaseSummaryDto.cs */
export interface PurchaseSummaryDto {
  totalThisMonth: number;
  creditPending:  number;
  purchaseCount:  number;
}

// ── Request payloads ──────────────────────────────────────────────────────────

export interface PurchaseItemRequest {
  productId:    number;
  productName:  string;
  quantity:     number;
  pricePerUnit: number;
  total:        number;
}

export interface CreatePurchaseRequest {
  supplierId:    number;
  supplierName:  string;
  items:         PurchaseItemRequest[];
  grandTotal:    number;
  paidAmount:    number;
  balance:       number;
  paymentStatus: 'Paid' | 'Credit';
  notes?:        string;
}

export interface UpdatePurchaseRequest extends CreatePurchaseRequest {
  rowVersion: string;   // required for optimistic concurrency
}


export interface GetPurchasesParams {
  status?:     'Paid' | 'Credit';
  supplierId?: number;
  search?:     string;
  dateFrom?:   string;
  dateTo?:     string;
  page?:       number;
  pageSize?:   number;
}