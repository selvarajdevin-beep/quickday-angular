// src/app/models/constants.models.ts
// ─────────────────────────────────────────────────────────────────────────────
// TypeScript DTOs that mirror the C# AppConstantsDto returned by
//   GET /api/settings/constants
// ─────────────────────────────────────────────────────────────────────────────

export interface AppConstantItem {
  value: string;
  label: string;
  icon:  string | null;
}

export interface AppConstantsDto {
  paymentTypes:      AppConstantItem[];
  orderStatuses:     AppConstantItem[];
  purchaseStatuses:  AppConstantItem[];
  customerTypes:     AppConstantItem[];
  expenseTypes:      AppConstantItem[];
  gstTypes:          AppConstantItem[];
  subscriptionPlans: AppConstantItem[];
  currencies:        AppConstantItem[];
  themeColors:       AppConstantItem[];
  salaryTypes:       AppConstantItem[];
  appModules:        AppConstantItem[];
  shopTypes:         AppConstantItem[];
  /** shopType name → list of unit strings */
  shopUnitTypes:     Record<string, string[]>;
  /** shopType name → list of category strings */
  shopCategories:    Record<string, string[]>;
  /** plan name → list of feature strings */
  planFeatures:      Record<string, string[]>;
  planPricing:  Record<string, number>;
}