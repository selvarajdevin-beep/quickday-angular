// models/settings.models.ts
// ─────────────────────────────────────────────────────────────────────────────
// Client-side models that exactly mirror the C# response DTOs.
// Import these in SettingsService and SharedStateService.
// ─────────────────────────────────────────────────────────────────────────────

// ── Settings ──────────────────────────────────────────────────────────────────

/** Mirrors SettingsDto.cs — returned by GET /api/settings and PUT /api/settings */
// export interface SettingsDto {
//   businessAccountId:     number;
//   businessName:          string;
//   ownerName:             string;
//   phone:                 string;
//   email:                 string;
//   address:               string;
//   gstin:                 string;
//   shopType:              string;
//   themeColor:            string;
//   currency:              'INR' | 'USD' | 'EUR' | 'GBP';
//   currencySymbol:        string;
//   subscriptionPlan:      'Free' | 'Basic' | 'Pro';
//   subscriptionStartDate: string | null;
//   subscriptionExpiry:    string;
//   /** Base64-encoded RowVersion — must be sent back on save for optimistic concurrency */
//   rowVersion:            string;
// }

export interface SettingsDto {
  businessAccountId:     number;
  businessName:          string;
  ownerName:             string;
  phone:                 string;
  email:                 string;
  address:               string;
  gstin:                 string;
  shopType:              string;
  themeColor:            string;
  currency:              'INR' | 'USD' | 'EUR' | 'GBP';
  currencySymbol:        string;

  subscriptionPlan:      'Free' | 'Basic' | 'Pro';
  subscriptionStartDate: string | null;
  subscriptionExpiry:    string;

  /** Base64-encoded RowVersion — must be sent back on save */
  rowVersion:            string;

  // ✅ NEW GST fields
  gstEnabled:       boolean;
  gstType:          'None' | 'GST' | 'IGST';
  cgstRate:         number;
  sgstRate:         number;
  igstRate:         number;
  showGstOnInvoice: boolean;

  // ✅ NEW Logo fields
  logoUrl:           string;
  showLogoOnInvoice: boolean;

  // ✅ NEW Invoice settings
  invoiceShowTime: boolean;
}

/** Payload for PUT /api/settings */
// export interface UpdateSettingsRequest {
//   businessName:  string;
//   ownerName:     string;
//   businessPhone: string;
//   businessEmail: string;
//   address:       string;
//   gstin:         string;
//   shopType:      string;
//   themeColor:    string;
//   currency:      string;
//   /** Must match the rowVersion from the last GET response */
//   rowVersion:    string;
// }

export interface UpdateSettingsRequest {
  businessName:  string;
  ownerName:     string;
  businessPhone: string;
  businessEmail: string;
  address:       string;
  gstin:         string;
  shopType:      string;
  themeColor:    string;
  currency:      string;

  /** Must match the rowVersion from the last GET response */
  rowVersion:    string;

  // ✅ NEW GST fields
  gstEnabled:       boolean;
  gstType:          'None' | 'GST' | 'IGST';
  cgstRate:         number;
  sgstRate:         number;
  igstRate:         number;
  showGstOnInvoice: boolean;

  // ✅ NEW Logo fields
  logoUrl:           string;
  showLogoOnInvoice: boolean;

  // ✅ NEW Invoice settings
  invoiceShowTime: boolean;
}

// ── Permissions ───────────────────────────────────────────────────────────────

/** Mirrors PermissionDto.cs */
export interface PermissionDto {
  module:    string;
  canView:   boolean;
  canCreate: boolean;
  canEdit:   boolean;
  canDelete: boolean;
}

/** Mirrors AllRolePermissionsDto.cs — returned on initial settings load */
export interface AllRolePermissionsDto {
  admin:  PermissionDto[];
  worker: PermissionDto[];
}

/** Payload for PUT /api/settings/permissions/{role} */
export interface SaveRolePermissionsRequest {
  permissions: PermissionDto[];
}

// ── Combined GET /api/settings response body ──────────────────────────────────

export interface SettingsPageData {
  settings:    SettingsDto;
  permissions: AllRolePermissionsDto;
}
