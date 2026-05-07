/**
 * UserService
 * ─────────────────────────────────────────────────────────────────────────────
 * All operations now hit the real API:
 *   GET    /api/users                       → getUsers()
 *   GET    /api/users/{id}                  → getUserById()
 *   POST   /api/users                       → createUser()
 *   PUT    /api/users/{id}                  → updateUser()
 *   PATCH  /api/users/{id}/toggle-status    → toggleUserStatus()
 *   DELETE /api/users/{id}                  → deleteUser()
 *   POST   /api/users/{id}/reset-password   → resetPassword()
 *
 * Signal contract is identical — SharedStateService.users and the
 * CoreStateService._users signal stay in sync after every mutation.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { CoreStateService }  from './core-state.service';
import { AppUser, UserRole, Permission, SalaryDetail, PagedResult } from './shared-state.interfaces';
import {
  UserDto, CreateUserRequest, UpdateUserRequest, ResetPasswordRequest,
  GetUsersParams,
} from '../models/user.models';
import { ApiResponse } from '../models/auth.models';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserService {

  // private readonly api = '/api/users';
  private readonly api = `${environment.apiUrl}/users`;

  // ── Row-version cache ─────────────────────────────────────────────────────
  // Maps userId → base64 RowVersion so the component never has to manage it.
  private _rowVersions = new Map<number, string>();

  // ── Expose read-only signal ───────────────────────────────────────────────
  users!: typeof this.core.users;

  constructor(
    private core: CoreStateService,
    private http: HttpClient,
  ) {
    this.users = this.core.users;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // READ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/users
   * Fetches all users, populates CoreStateService._users signal,
   * and returns Observable<AppUser[]> for backward compatibility
   * with UsersComponent.ngOnInit().
   */
  // getUsers(): Observable<AppUser[]> {
  //   return this.http
  //     .get<ApiResponse<UserDto[]>>(this.api)
  //     .pipe(
  //       map(res => {
  //         if (!res.success || !res.data)
  //           throw new Error(res.message ?? 'Failed to load users.');
  //         return res.data;
  //       }),
  //       tap(dtos => {
  //         // Cache row versions for all users
  //         dtos.forEach(d => this._rowVersions.set(d.id, d.rowVersion));
  //         // Write into CoreStateService — all computed signals update instantly
  //         this.core._users.set(dtos.map(d => this._dtoToAppUser(d)));
  //       }),
  //       map(dtos => dtos.map(d => this._dtoToAppUser(d))),
  //       catchError(err => throwError(() => this._extractError(err))),
  //     );
  // }

getUsers(params?: GetUsersParams): Observable<PagedResult<AppUser>> {
  const p: string[] = [];
 
  if (params?.page)     p.push(`page=${params.page}`);
  if (params?.pageSize) p.push(`pageSize=${params.pageSize}`);
  if (params?.search)   p.push(`search=${encodeURIComponent(params.search)}`);
  if (params?.status)   p.push(`status=${encodeURIComponent(params.status)}`);
  if (params?.role)     p.push(`role=${encodeURIComponent(params.role)}`);   // ← NEW
 
  const url = p.length ? `${this.api}?${p.join('&')}` : this.api;
 
  return this.http
    .get<ApiResponse<PagedResult<UserDto>>>(url)
    .pipe(
      map(res => {
        if (!res.success || !res.data)
          throw new Error(res.message ?? 'Failed to load users.');
        return res.data;
      }),
      tap(paged => {
        paged.items.forEach(d => this._rowVersions.set(d.id, d.rowVersion));
        this.core._users.set(paged.items.map(d => this._dtoToAppUser(d)));
      }),
      map(paged => ({
        items:      paged.items.map(d => this._dtoToAppUser(d)),
        totalCount: paged.totalCount,
        page:       paged.page,
        pageSize:   paged.pageSize,
        totalPages: paged.totalPages,
        hasNext:    paged.hasNext,
        hasPrev:    paged.hasPrev,
      } satisfies PagedResult<AppUser>)),
      catchError(err => throwError(() => this._extractError(err))),
    );
}

// ══════════════════════════════════════════════════════════════════════════
  // WRITE — each mutation patches the _users signal optimistically
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/users
   * Creates a user. On success, appends to the _users signal.
   */
  createUser(data: Partial<AppUser> & { password?: string }): Observable<AppUser> {
    const payload: CreateUserRequest = {
      username:         data.name         ?? '',
      phone:            data.phone        ?? '',
      email:            data.email        || undefined,
      password:         data['password']  ?? '',
      role:             data.role         ?? 'Worker',
      designation:      data.designation  || undefined,
      department:       data.department   || undefined,
      address:          data.address      || undefined,
      emergencyContact: data.emergencyContact || undefined,
      notes:            data.notes        || undefined,
      dateOfJoining:    data.dateOfJoining
                          ? new Date(data.dateOfJoining).toISOString().slice(0, 10)
                          : undefined,
      monthlySalary:    data.salaryDetails?.monthlySalary ?? 0,
      salaryType:       data.salaryDetails?.salaryType    ?? 'Fixed',
      bankAccount:      data.salaryDetails?.bankAccount   || undefined,
      bankName:         data.salaryDetails?.bankName      || undefined,
      ifsc:             data.salaryDetails?.ifsc          || undefined,
    };

    return this.http
      .post<ApiResponse<UserDto>>(this.api, payload)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to create user.');
          return res.data;
        }),
        tap(dto => {
          this._rowVersions.set(dto.id, dto.rowVersion);
          const user = this._dtoToAppUser(dto);
          this.core._users.update(list => [...list, user]);
        }),
        map(dto => this._dtoToAppUser(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  /**
   * PUT /api/users/{id}
   * Updates profile + HR info. Sends RowVersion for concurrency control.
   * On success, replaces the user in the _users signal.
   */
  updateUser(id: number, data: Partial<AppUser>): Observable<AppUser> {
    const rowVersion = this._rowVersions.get(id) ?? '';

    const payload: UpdateUserRequest = {
      username:         data.name         ?? '',
      phone:            data.phone        ?? '',
      email:            data.email        || undefined,
      role:             data.role         ?? 'Worker',
      designation:      data.designation  || undefined,
      department:       data.department   || undefined,
      address:          data.address      || undefined,
      emergencyContact: data.emergencyContact || undefined,
      notes:            data.notes        || undefined,
      dateOfJoining:    data.dateOfJoining
                          ? new Date(data.dateOfJoining).toISOString().slice(0, 10)
                          : undefined,
      monthlySalary:    data.salaryDetails?.monthlySalary ?? 0,
      salaryType:       data.salaryDetails?.salaryType    ?? 'Fixed',
      bankAccount:      data.salaryDetails?.bankAccount   || undefined,
      bankName:         data.salaryDetails?.bankName      || undefined,
      ifsc:             data.salaryDetails?.ifsc          || undefined,
      rowVersion,
    };

    return this.http
      .put<ApiResponse<UserDto>>(`${this.api}/${id}`, payload)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to update user.');
          return res.data;
        }),
        tap(dto => {
          this._rowVersions.set(dto.id, dto.rowVersion);
          const updated = this._dtoToAppUser(dto);
          this.core._users.update(list =>
            list.map(u => u.id === updated.id ? updated : u));
        }),
        map(dto => this._dtoToAppUser(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  /**
   * PATCH /api/users/{id}/toggle-status
   * Activates or deactivates a user.
   */
  toggleUserStatus(id: number): Observable<AppUser> {
    return this.http
      .patch<ApiResponse<UserDto>>(`${this.api}/${id}/toggle-status`, {})
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Failed to update user status.');
          return res.data;
        }),
        tap(dto => {
          this._rowVersions.set(dto.id, dto.rowVersion);
          const updated = this._dtoToAppUser(dto);
          this.core._users.update(list =>
            list.map(u => u.id === updated.id ? updated : u));
        }),
        map(dto => this._dtoToAppUser(dto)),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  /**
   * DELETE /api/users/{id}
   * Soft-deletes the user. Removes from the _users signal on success.
   */
  deleteUser(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.api}/${id}`)
      .pipe(
        tap(() => {
          this._rowVersions.delete(id);
          this.core._users.update(list => list.filter(u => u.id !== id));
        }),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  /**
   * POST /api/users/{id}/reset-password
   * Sends new password to the API for hashing + storage.
   */
  resetPassword(userId: number, newPassword: string): Observable<void> {
    const payload: ResetPasswordRequest = { newPassword };
    return this.http
      .post<ApiResponse<void>>(`${this.api}/${userId}/reset-password`, payload)
      .pipe(
        map(res => {
          if (!res.success)
            throw new Error(res.message ?? 'Failed to reset password.');
        }),
        catchError(err => throwError(() => this._extractError(err))),
      );
  }

  // ── Signal accessor (for SharedStateService facade) ───────────────────────
  getUsersSignal() { return this.core._users; }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE — DTO ↔ AppUser conversion
  // ══════════════════════════════════════════════════════════════════════════

  private _dtoToAppUser(dto: UserDto): AppUser {
    return {
      id:               dto.id,
      name:             dto.name,
      phone:            dto.phone,
      email:            dto.email,
      role:             dto.role,
      status:           dto.status,
      lastLogin:        dto.lastLogin ? new Date(dto.lastLogin) : null,
      createdAt:        new Date(dto.createdAt),
      permissions:      dto.permissions.map(p => ({
        module:    p.module,
        canView:   p.canView,
        canCreate: p.canCreate,
        canEdit:   p.canEdit,
        canDelete: p.canDelete,
      })) as Permission[],
      designation:      dto.designation       ?? undefined,
      department:       dto.department        ?? undefined,
      address:          dto.address           ?? undefined,
      emergencyContact: dto.emergencyContact  ?? undefined,
      notes:            dto.notes             ?? undefined,
      dateOfJoining:    dto.dateOfJoining
                          ? new Date(dto.dateOfJoining)
                          : undefined,
      salaryDetails:    dto.salaryDetails
                          ? {
                              monthlySalary: dto.salaryDetails.monthlySalary,
                              salaryType:    dto.salaryDetails.salaryType as SalaryDetail['salaryType'],
                              bankAccount:   dto.salaryDetails.bankAccount,
                              bankName:      dto.salaryDetails.bankName,
                              ifsc:          dto.salaryDetails.ifsc,
                            }
                          : undefined,
    };
  }

  private _extractError(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      const msg = err.error?.message;
      if (typeof msg === 'string' && msg.length > 0) return new Error(msg);
      if (err.status === 0)   return new Error('Cannot reach server. Check your connection.');
      if (err.status === 401) return new Error('Session expired. Please log in again.');
      if (err.status === 403) return new Error('You do not have permission to manage users.');
      if (err.status === 409) return new Error('This record was modified by someone else. Please refresh and try again.');
      if (err.status === 500) return new Error('Server error. Please try again later.');
    }
    if (err instanceof Error) return err;
    return new Error('An unexpected error occurred.');
  }
}
