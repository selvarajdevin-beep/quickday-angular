// models/customer.models.ts
// ─────────────────────────────────────────────────────────────────────────────

export type CustomerTypeValue = 'Hotel' | 'Home';

/** Mirrors CustomerDto.cs */
export interface CustomerDto {
  id:                    number;
  businessAccountId:     number;
  name:                  string;
  phone:                 string;
  address:               string;
  customerType:          CustomerTypeValue;
  defaultPricePerCan:    number;
  defaultPriceProductId: number;
  usePriceFromProduct:   boolean;
  totalOrders:           number;
  totalDue:              number;
  lastOrderDate:         string | null;
  active:                boolean;
  createdAt:             string;
  /** Base64 RowVersion — sent back on UPDATE */
  rowVersion:            string;
}

// ── Request payloads ──────────────────────────────────────────────────────────

export interface CreateCustomerRequest {
  name:                  string;
  phone:                 string;
  address?:              string;
  customerType:          CustomerTypeValue;
  defaultPricePerCan:    number;
  defaultPriceProductId: number;
  usePriceFromProduct:   boolean;
}

export interface UpdateCustomerRequest extends CreateCustomerRequest {
  rowVersion: string;
}
