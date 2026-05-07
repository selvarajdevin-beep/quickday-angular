// models/supplier.models.ts
// ─────────────────────────────────────────────────────────────────────────────
// Client-side models mirroring the C# DTOs exactly.
// ─────────────────────────────────────────────────────────────────────────────

export interface PurchaseItemDto {
  productId:    number;
  productName:  string;
  quantity:     number;
  pricePerUnit: number;
  total:        number;
}

/** Mirrors SupplierDto.cs — all Supplier API responses */
export interface SupplierDto {
  id:                number;
  businessAccountId: number;
  name:              string;
  phone:             string;
  email:             string;
  address:           string;
  gstin:             string;
  contactPerson:     string;
  notes:             string;
  active:            boolean;
  createdAt:         string;
  totalPurchases:    number;
  totalAmount:       number;
  amountDue:         number;
  lastPurchaseDate:  string | null;
  /** Base64 RowVersion — must be sent back on UPDATE */
  rowVersion:        string;
}

/** Mirrors PurchaseDto.cs */
export interface PurchaseDto {
  id:            number;
  supplierId:    number;
  supplierName:  string;
  items:         PurchaseItemDto[];
  grandTotal:    number;
  paidAmount:    number;
  balance:       number;
  paymentStatus: 'Paid' | 'Credit';
  notes?:        string;
  createdAt:     string;
  rowVersion:    string;
}

// ── Request payloads ──────────────────────────────────────────────────────────

export interface CreateSupplierRequest {
  name:           string;
  phone:          string;
  email?:         string;
  address?:       string;
  gstin?:         string;
  contactPerson?: string;
  notes?:         string;
  active?:        boolean;
}

export interface UpdateSupplierRequest extends CreateSupplierRequest {
  rowVersion: string;   // required for optimistic concurrency
}

export interface RecordSupplierPaymentRequest {
  amount: number;
}

export interface GetSuppliersParams {
  search?:   string;
  status?:   'active' | 'inactive';
  page?:     number;
  pageSize?: number;
}
