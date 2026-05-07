// src/app/models/superadmin.models.ts

export interface SuperAdminDashboardDto {
  totalShops:       number;
  activeShops:      number;
  expiringIn30Days: number;
  expiredShops:     number;
  freePlanCount:    number;
  basicPlanCount:   number;
  proPlanCount:     number;
}

export type SubscriptionStatus = 'Active' | 'Expiring' | 'Expired';

export interface ShopListItemDto {
  businessAccountId:     number;
  businessName:          string;
  ownerName:             string;
  businessPhone:         string | null;
  businessEmail:         string | null;
  isActive:              boolean;
  createdAt:             string;
  shopType:              string | null;
  subscriptionPlan:      string;
  subscriptionStartDate: string | null;
  subscriptionExpiry:    string | null;
  daysLeft:              number;
  userCount:             number;
  subscriptionStatus:    SubscriptionStatus;
}

export interface ShopDetailDto extends ShopListItemDto {
  address:     string | null;
  gstin:       string | null;
  themeColor:  string | null;
  currency:    string | null;
  totalOrders: number;
}

export interface PagedShopsDto {
  items:      ShopListItemDto[];
  totalCount: number;
  page:       number;
  pageSize:   number;
  totalPages: number;
  hasNext:    boolean;
  hasPrev:    boolean;
}

export interface UpdateSubscriptionRequest {
  subscriptionPlan:      string;
  subscriptionStartDate: string; // YYYY-MM-DD
  subscriptionExpiry:    string; // YYYY-MM-DD
}

// ── Payments ──────────────────────────────────────────────────────────────────

export type PaymentStatus = 'Paid' | 'Pending' | 'Failed';

export interface PaymentHistoryItemDto {
  paymentId:             number;
  businessAccountId:     number;
  businessName:          string;
  ownerName:             string;
  plan:                  string;        // SP alias: SubscriptionPlan AS Plan
  durationMonths:        number;
  amount:                number;
  currency:              string;
  paymentStatus:         PaymentStatus;
  paymentDate:           string;        // ISO datetime — ISNULL(PaidAt, CreatedAt)
  subscriptionStartDate: string;        // YYYY-MM-DD — PeriodStart
  subscriptionExpiry:    string;        // YYYY-MM-DD — PeriodEnd
  transactionRef:        string | null; // SP alias: TransactionReference AS TransactionRef
  notes:                 string | null;
}

export interface PagedPaymentsDto {
  items:      PaymentHistoryItemDto[];
  totalCount: number;
  page:       number;
  pageSize:   number;
  totalPages: number;
  hasNext:    boolean;
  hasPrev:    boolean;
}

export interface CreatePaymentRequest {
  businessAccountId: number;
  plan:              string;        // maps to @SubscriptionPlan in SP
  durationMonths:    number;
  amount:            number;
  currency:          string;
  paymentStatus:     PaymentStatus;
  transactionRef?:   string;        // maps to @TransactionReference in SP
  notes?:            string;
}

/** Used by PUT /api/superadmin/payments/{id} */
export interface UpdatePaymentRequest {
  plan:          string;        // maps to @SubscriptionPlan in SP
  paymentStatus: PaymentStatus;
}

export interface PlanPricing {
  plan:        string;
  monthlyRate: number;
  description: string;
  features:    string[];
}

// ── Revenue stats ─────────────────────────────────────────────────────────────

export interface MonthlyRevenueDto {
  monthLabel:   string; // "YYYY-MM"
  monthDisplay: string; // "Jan 25"
  revenue:      number;
  transactions: number;
}

export interface PlanRevenueDto {
  plan:           string;
  revenue:        number;
  transactions:   number;
  revenuePercent: number;
}

export interface RecentPaymentDto {
  paymentId:      number;
  businessName:   string;
  ownerName:      string;
  plan:           string;
  amount:         number;
  currency:       string;
  durationMonths: number;
  paymentMethod:  string | null;
  paymentDate:    string;
}

export interface RevenueStatsDto {
  totalRevenue:            number;
  currentMonthRevenue:     number;
  previousMonthRevenue:    number;
  pendingRevenue:          number;
  totalTransactions:       number;
  activePaidSubscriptions: number;
  avgRevenuePerBusiness:   number;
  momChangePercent:        number;
  monthlyRevenue:          MonthlyRevenueDto[];
  planRevenue:             PlanRevenueDto[];
  recentPayments:          RecentPaymentDto[];
}