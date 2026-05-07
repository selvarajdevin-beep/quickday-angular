// models/user.models.ts
// ─────────────────────────────────────────────────────────────────────────────
// Client-side models that exactly mirror the C# UserDto / request classes.
// ─────────────────────────────────────────────────────────────────────────────

// ── Response DTOs ─────────────────────────────────────────────────────────────

export interface SalaryDetailDto {
  monthlySalary: number;
  salaryType:    string;
  bankAccount?:  string;
  bankName?:     string;
  ifsc?:         string;
}

export interface PermissionDto {
  module:    string;
  canView:   boolean;
  canCreate: boolean;
  canEdit:   boolean;
  canDelete: boolean;
}

/** Mirrors UserDto.cs — returned by all User API endpoints */
export interface UserDto {
  id:                number;
  businessAccountId: number;
  name:              string;
  phone:             string;
  email:             string;
  role:              'Admin' | 'Worker';
  status:            'Active' | 'Inactive';
  designation?:      string;
  department?:       string;
  address?:          string;
  emergencyContact?: string;
  notes?:            string;
  avatarInitials?:   string;
  dateOfJoining?:    string;       // "yyyy-MM-dd"
  lastLogin?:        string | null;
  createdAt:         string;
  salaryDetails?:    SalaryDetailDto | null;
  permissions:       PermissionDto[];
  /** Base64 RowVersion — must be sent back on update */
  rowVersion:        string;
}

// ── Request payloads ──────────────────────────────────────────────────────────

export interface CreateUserRequest {
  username:         string;
  phone:            string;
  email?:           string;
  password:         string;
  role:             'Admin' | 'Worker';
  designation?:     string;
  department?:      string;
  address?:         string;
  emergencyContact?: string;
  notes?:           string;
  dateOfJoining?:   string;
  monthlySalary?:   number;
  salaryType?:      string;
  bankAccount?:     string;
  bankName?:        string;
  ifsc?:            string;
}

export interface UpdateUserRequest {
  username:         string;
  phone:            string;
  email?:           string;
  role:             'Admin' | 'Worker';
  designation?:     string;
  department?:      string;
  address?:         string;
  emergencyContact?: string;
  notes?:           string;
  dateOfJoining?:   string;
  monthlySalary?:   number;
  salaryType?:      string;
  bankAccount?:     string;
  bankName?:        string;
  ifsc?:            string;
  /** RowVersion from the last GET — required for optimistic concurrency */
  rowVersion:       string;
}

export interface ResetPasswordRequest {
  newPassword: string;
}

export interface GetUsersParams {
  page?:     number;
  pageSize?: number;
  search?:   string;
  status?:   string;   // 'Active' | 'Inactive' | undefined = all
  role?:     string;   // ← NEW: 'Admin' | 'Worker' | undefined = all
}