/**
 * settings.service.ts — UPDATED
 * Added GST config, logoUrl, showLogoOnInvoice, invoiceShowTime to:
 *   - _applySettingsToCore()
 *   - _dtoToBusinessSettings()
 *   - saveSettings() payload (UpdateSettingsRequest)
 *   - loadMyRolePermissions() patch
 */
import { Injectable, computed, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, tap } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { CoreStateService }  from './core-state.service';
import {
  BusinessSettings, UserRole, Permission, RoleTemplate,
} from './shared-state.interfaces';
import {
  SettingsDto, UpdateSettingsRequest, PermissionDto,
  AllRolePermissionsDto, SaveRolePermissionsRequest, SettingsPageData,
} from '../models/settings.models';
import { ApiResponse } from '../models/auth.models';
import { environment } from '../../environments/environment';

export interface MyRolePermissionsDto {
  businessName:   string;
  themeColor:     string;
  currency:       string;
  currencySymbol: string;
  shopType:       string;
  role:           string;
  permissions:    PermissionDto[];
}

// const CURRENCY_SYMBOLS: Record<string, string> = {
//   INR: '₹', USD: '$', EUR: '€', GBP: '£',
// };

@Injectable({ providedIn: 'root' })
export class SettingsService {

  // private readonly api = '/api/settings';
  private readonly api = `${environment.apiUrl}/settings`;

  private _rowVersion = signal<string>('');

  settings!:          typeof this.core.settings;
  businessName!:      typeof this.core.businessName;
  ownerName!:         typeof this.core.ownerName;
  themeColor!:        typeof this.core.themeColor;
  currency!:          typeof this.core.currency;
  currencySymbol!:    typeof this.core.currencySymbol;
  shopType!:          typeof this.core.shopType;
  shopUnitTypes!:     typeof this.core.shopUnitTypes;
  shopCategories!:    typeof this.core.shopCategories;

  constructor(
    private core: CoreStateService,
    private http: HttpClient,
  ) {
    this.settings       = this.core.settings;
    this.businessName   = this.core.businessName;
    this.ownerName      = this.core.ownerName;
    this.themeColor     = this.core.themeColor;
    this.currency       = this.core.currency;
    this.currencySymbol = this.core.currencySymbol;
    this.shopType       = this.core.shopType;
    this.shopUnitTypes  = this.core.shopUnitTypes;
    this.shopCategories = this.core.shopCategories;
  }

  // ── Get settings (Admin) ──────────────────────────────────
  getSettings(): Observable<BusinessSettings> {
    return this.http
      .get<ApiResponse<SettingsPageData>>(this.api)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load settings.');
          return res.data;
        }),
        tap(data => {
          this._applySettingsToCore(data.settings);
          this._applyPermissionsToCore(data.permissions);
        }),
        map(data => this._dtoToBusinessSettings(data.settings)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // ── Load permissions for any role (lightweight) ───────────
  loadMyRolePermissions(): Observable<void> {
    return this.http
      .get<ApiResponse<MyRolePermissionsDto>>(`${this.api}/permissions/my-role`)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to load permissions.');
          return res.data;
        }),
        tap(dto => {
          this.core._settings.update(current => ({
            ...current,
            businessName:   dto.businessName,
            themeColor:     dto.themeColor,
            currency:       dto.currency as any,
            currencySymbol: dto.currencySymbol,
            shopType:       dto.shopType as any,
          }));

          const role   = dto.role as UserRole;
          const mapped = dto.permissions.map(p => this._dtoToPermission(p));
          this.core._rolePermissions.update(current => ({
            ...current,
            [role]: mapped,
          }));

          this.applyThemeToDom(dto.themeColor);
        }),
        map(() => void 0),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // ── Save settings (Admin) ─────────────────────────────────
  saveSettings(data: Partial<BusinessSettings>): Observable<BusinessSettings> {
    const payload: UpdateSettingsRequest = {
      businessName:  data.businessName  ?? '',
      ownerName:     data.ownerName     ?? '',
      businessPhone: data.phone         ?? '',
      businessEmail: data.email         ?? '',
      address:       data.address       ?? '',
      gstin:         data.gstin         ?? '',
      shopType:      data.shopType      ?? 'Other',
      themeColor:    data.themeColor    ?? '#0057FF',
      currency:      data.currency      ?? 'INR',
      rowVersion:    this._rowVersion(),
      // ── NEW GST fields ─────────────────────────────────────
      gstEnabled:       (data as any).gstEnabled       ?? false,
      gstType:          (data as any).gstType           ?? 'None',
      cgstRate:         (data as any).cgstRate          ?? 2.5,
      sgstRate:         (data as any).sgstRate          ?? 2.5,
      igstRate:         (data as any).igstRate          ?? 5,
      showGstOnInvoice: (data as any).showGstOnInvoice  ?? true,
      // ── NEW Logo fields ─────────────────────────────────────
      logoUrl:           (data as any).logoUrl           ?? '',
      showLogoOnInvoice: (data as any).showLogoOnInvoice ?? true,
      // ── NEW Invoice date+time ───────────────────────────────
      invoiceShowTime:  (data as any).invoiceShowTime   ?? false,
    };

    return this.http
      .put<ApiResponse<SettingsDto>>(this.api, payload)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to save settings.');
          return res.data;
        }),
        tap(dto => this._applySettingsToCore(dto)),
        map(dto => this._dtoToBusinessSettings(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // ── Save permissions ──────────────────────────────────────
  saveRolePermissions(role: UserRole, permissions: Permission[]): Observable<Permission[]> {
    const payload: SaveRolePermissionsRequest = {
      permissions: permissions.map(p => ({
        module:    p.module,
        canView:   p.canView,
        canCreate: p.canCreate,
        canEdit:   p.canEdit,
        canDelete: p.canDelete,
      })),
    };

    return this.http
      .put<ApiResponse<PermissionDto[]>>(
        `${this.api}/permissions/${role.toLowerCase()}`, payload)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to save permissions.');
          return res.data;
        }),
        tap(dtos => {
          const mapped = dtos.map(d => this._dtoToPermission(d));
          this.core._rolePermissions.update(current => ({
            ...current,
            [role]: mapped,
          }));
          this.core._users.update(list =>
            list.map(u => u.role === role
              ? { ...u, permissions: mapped.map(p => ({ ...p })) }
              : u)
          );
        }),
        map(dtos => dtos.map(d => this._dtoToPermission(d))),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // ── Export ────────────────────────────────────────────────
  exportData(): Observable<Blob> {
    return this.http
      .get(`${this.api}/export`, { responseType: 'blob' })
      .pipe(catchError(err => throwError(() => this._extractError(err))));
  }

  // ── Role permission helpers ───────────────────────────────
  getRolePerms(role: UserRole): Permission[] {
    return this.core._rolePermissions()[role];
  }

  getRoleTemplates(): RoleTemplate[] {
    return [
      { role: 'Admin',  permissions: this.core._rolePermissions().Admin.map(p => ({ ...p }))  },
      { role: 'Worker', permissions: this.core._rolePermissions().Worker.map(p => ({ ...p })) },
    ];
  }

  visibleModulesForRole(role: UserRole): string[] {
    return this.core._rolePermissions()[role].filter(p => p.canView).map(p => p.module);
  }

  visibleModulesSignal(role: UserRole) {
    return computed(() =>
      this.core._rolePermissions()[role].filter(p => p.canView).map(p => p.module)
    );
  }

  // ── Theme ─────────────────────────────────────────────────
  applyThemeToDom(color: string): void {
    document.documentElement.style.setProperty('--app-primary', color);
    document.documentElement.style.setProperty('--app-primary-light', color + '22');
  }

  getSettingsSignal() { return this.core._settings; }

  // ── Private helpers ───────────────────────────────────────

  private _applySettingsToCore(dto: SettingsDto): void {
    this._rowVersion.set(dto.rowVersion ?? '');
    this.core._settings.set({
      businessName:          dto.businessName,
      ownerName:             dto.ownerName,
      phone:                 dto.phone,
      email:                 dto.email,
      address:               dto.address,
      gstin:                 dto.gstin,
      shopType:              dto.shopType as any,
      themeColor:            dto.themeColor,
      currency:              dto.currency,
      currencySymbol:        dto.currencySymbol,
      subscriptionPlan:      dto.subscriptionPlan,
      subscriptionStartDate: dto.subscriptionStartDate ?? undefined,
      subscriptionExpiry:    dto.subscriptionExpiry,
      // ── NEW fields (fall back to defaults if API not yet updated) ──
      gstEnabled:       (dto as any).gstEnabled       ?? false,
      gstType:          (dto as any).gstType           ?? 'None',
      cgstRate:         (dto as any).cgstRate          ?? 2.5,
      sgstRate:         (dto as any).sgstRate          ?? 2.5,
      igstRate:         (dto as any).igstRate          ?? 5,
      showGstOnInvoice: (dto as any).showGstOnInvoice  ?? true,
      logoUrl:           (dto as any).logoUrl           ?? '',
      showLogoOnInvoice: (dto as any).showLogoOnInvoice ?? true,
      invoiceShowTime:  (dto as any).invoiceShowTime   ?? false,
    });
    this.applyThemeToDom(dto.themeColor);
  }

  private _applyPermissionsToCore(dto: AllRolePermissionsDto): void {
    this.core._rolePermissions.set({
      Admin:  dto.admin.map(p => this._dtoToPermission(p)),
      Worker: dto.worker.map(p => this._dtoToPermission(p)),
    });
  }

  private _dtoToBusinessSettings(dto: SettingsDto): BusinessSettings {
    return {
      businessName:          dto.businessName,
      ownerName:             dto.ownerName,
      phone:                 dto.phone,
      email:                 dto.email,
      address:               dto.address,
      gstin:                 dto.gstin,
      shopType:              dto.shopType as any,
      themeColor:            dto.themeColor,
      currency:              dto.currency,
      currencySymbol:        dto.currencySymbol,
      subscriptionPlan:      dto.subscriptionPlan,
      subscriptionStartDate: dto.subscriptionStartDate ?? undefined,
      subscriptionExpiry:    dto.subscriptionExpiry,
      gstEnabled:       (dto as any).gstEnabled       ?? false,
      gstType:          (dto as any).gstType           ?? 'None',
      cgstRate:         (dto as any).cgstRate          ?? 2.5,
      sgstRate:         (dto as any).sgstRate          ?? 2.5,
      igstRate:         (dto as any).igstRate          ?? 5,
      showGstOnInvoice: (dto as any).showGstOnInvoice  ?? true,
      logoUrl:           (dto as any).logoUrl           ?? '',
      showLogoOnInvoice: (dto as any).showLogoOnInvoice ?? true,
      invoiceShowTime:  (dto as any).invoiceShowTime   ?? false,
    };
  }

  private _dtoToPermission(dto: PermissionDto): Permission {
    return {
      module:    dto.module,
      canView:   dto.canView,
      canCreate: dto.canCreate,
      canEdit:   dto.canEdit,
      canDelete: dto.canDelete,
    };
  }

  private _extractError(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      const msg = err.error?.message;
      if (typeof msg === 'string' && msg.length > 0) return new Error(msg);
      if (err.status === 0)   return new Error('Cannot reach server. Check your connection.');
      if (err.status === 401) return new Error('Session expired. Please log in again.');
      if (err.status === 403) return new Error('You do not have permission to access settings.');
      if (err.status === 409) return new Error('Settings were changed by someone else. Please refresh.');
      if (err.status === 500) return new Error('Server error. Please try again later.');
    }
    if (err instanceof Error) return err;
    return new Error('An unexpected error occurred.');
  }
}
