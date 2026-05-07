// models/expense.models.ts
// ─────────────────────────────────────────────────────────────────────────────
// Client-side models mirroring the C# ExpenseDto / summary DTOs exactly.
// ─────────────────────────────────────────────────────────────────────────────

export type ExpenseTypeValue =
  | 'Petrol'
  | 'Salary'
  | 'Vehicle Maintenance'
  | 'Rent'
  | 'Electricity'
  | 'Misc';

/** Mirrors ExpenseDto.cs — returned by all Expense API responses */
export interface ExpenseDto {
  id:                number;
  businessAccountId: number;
  type:              ExpenseTypeValue;
  amount:            number;
  /** ISO date string 'YYYY-MM-DD' */
  date:              string;
  notes:             string;
  createdAt:         string;
  /** Base64 RowVersion — must be sent back on UPDATE */
  rowVersion:        string;
}

export interface ExpenseSummaryByTypeDto {
  type:   ExpenseTypeValue;
  amount: number;
}

/** Mirrors ExpenseSummaryDto.cs */
export interface ExpenseSummaryDto {
  totalThisMonth: number;
  byType:         ExpenseSummaryByTypeDto[];
}

// ── Request payloads ──────────────────────────────────────────────────────────

export interface CreateExpenseRequest {
  type:    ExpenseTypeValue;
  amount:  number;
  /** ISO date string 'YYYY-MM-DD' */
  date:    string;
  notes?:  string;
}

export interface UpdateExpenseRequest extends CreateExpenseRequest {
  rowVersion: string;
}

export interface GetExpensesParams {
  page?:     number;
  pageSize?: number;
  from?:     string;
  to?:       string;
  type?:     ExpenseTypeValue;
  search?:   string;
}