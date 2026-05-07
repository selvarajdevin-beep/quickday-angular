// models/order.models.ts

import { Order, PagedResult } from "../services/shared-state.service";

export interface OrderItemDto {
  productId:    number;
  productName:  string;
  quantity:     number;
  pricePerUnit: number;
  total:        number;
}

export interface OrderDto {
  id:                number;
  businessAccountId: number;
  customerId:        number;
  customerName:      string;
  items:             OrderItemDto[];
  grandTotal:        number;
  paidAmount:        number;
  balance:           number;
  paymentType:       'Cash' | 'UPI' | 'Credit';
  status:            'Paid' | 'Partial' | 'Credit';
  deliveryNote?:     string;
  createdAt:         string;
  updatedAt?:        string;
  rowVersion:        string;
  // GST snapshot
  subTotal:      number;
  taxableAmount: number;
  gstType:       string;
  cgstRate:      number;
  sgstRate:      number;
  igstRate:      number;
  cgstAmount:    number;
  sgstAmount:    number;
  igstAmount:    number;
  totalGst:      number;
}

export interface PaymentDto {
  id:          number;
  customerId:  number;
  orderId?:    number;
  amount:      number;
  paymentType: 'Cash' | 'UPI';
  note:        string;
  date:        string;
}

export interface TodaySummaryDto {
  todaySales:     number;
  todayOrders:    number;
  cashAmount:     number;
  upiAmount:      number;
  creditAmount:   number;
  totalCustomers: number;
  creditPending:  number;
}

// ── GET /api/orders query params ──────────────────────────────────────────────
export interface GetOrdersParams {
  from?:        string;                            // YYYY-MM-DD
  to?:          string;                            // YYYY-MM-DD
  status?:      'all' | 'Paid' | 'Credit' | 'Partial'; // NEW
  search?:      string;                            // NEW — customer name / order id / note
  page?:        number;
  pageSize?:    number;
}

// ── Requests ──────────────────────────────────────────────────────────────────
export interface OrderItemRequest {
  productId:    number;
  productName:  string;
  quantity:     number;
  pricePerUnit: number;
  total:        number;
}

export interface CreateOrderRequest {
  customerId:    number;
  customerName:  string;
  items:         OrderItemRequest[];
  grandTotal:    number;
  paidAmount:    number;
  balance:       number;
  paymentType:   'Cash' | 'UPI' | 'Credit';
  status:        'Paid' | 'Partial' | 'Credit';
  deliveryNote?: string;
  // GST snapshot
  subTotal:      number;
  taxableAmount: number;
  gstType:       string;
  cgstRate:      number;
  sgstRate:      number;
  igstRate:      number;
  cgstAmount:    number;
  sgstAmount:    number;
  igstAmount:    number;
  totalGst:      number;
}

export interface UpdateOrderRequest extends CreateOrderRequest {
  rowVersion: string;
}

export interface RecordPaymentRequest {
  amount:      number;
  paymentType: 'Cash' | 'UPI';
  note?:       string;
  orderId?:    number;
}

// export interface OrderHistorySummary {
//   totalOrders: number;
//   totalSales:  number;
//   totalPaid:   number;
//   totalDue:    number;
// }
 
// export interface OrderHistoryResult extends PagedResult<Order> {
//   summary: OrderHistorySummary;
// }

export interface OrderHistorySummary {
  totalOrders: number;
  totalSales:  number;
  totalPaid:   number;
  totalDue:    number;
}
 
// The API returns PagedResult<OrderDto> + a summary object.
// We keep items as OrderDto[] here so _dtoToOrder() can map them.
export interface OrderHistoryApiResult {
  items:      OrderDto[];          // raw DTOs from the server
  totalCount: number;
  totalPages: number;
  page:       number;
  pageSize:   number;
  hasNext:    boolean;
  hasPrev:    boolean;
  summary:    OrderHistorySummary;
}
 
// What the method returns to callers (items already mapped to Order)
export interface OrderHistoryResult {
  items:      Order[];
  totalCount: number;
  totalPages: number;
  page:       number;
  pageSize:   number;
  hasNext:    boolean;
  hasPrev:    boolean;
  summary:    OrderHistorySummary;
}