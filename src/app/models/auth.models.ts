// src/app/models/auth.models.ts

// ── Request models (sent to API) ──────────────────────────

export interface LoginRequest {
  phone:    string;
  password: string;
}

export interface RegisterRequest {
  // Step 1 — Business Info
  businessName:  string;
  ownerName:     string;
  businessPhone: string;
  businessEmail: string;
  address:       string;
  gstin:         string;
  shopType:      string;
  // Step 2 — Account Setup
  username:        string;
  phone:           string;
  email:           string;
  password:        string;
  confirmPassword: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// ── Response models (received from API) ───────────────────

export interface ApiResponse<T> {
  success:   boolean;
  message:   string | null;
  data:      T | null;
  errorCode: string | null;
}

export interface AuthResponse {
  token:        string;
  refreshToken: string;
  user:         AuthUser;
}

export interface AuthUser {
  id:                number;
  name:              string;
  phone:             string;
  email:             string | null;
  role:              'Admin' | 'Worker';
  isSuperAdmin:      boolean;          // ← ADDED: true only for platform super-admin
  businessName:      string;
  businessAccountId: number;
  avatarInitials:    string | null;
  themeColor:        string;
  shopType:          string | null;
  currency:          string;
  currencySymbol:    string;
  subscriptionPlan:  string;
  subscriptionExpiry: string;
}