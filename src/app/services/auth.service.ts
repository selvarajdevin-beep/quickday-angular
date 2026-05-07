// src/app/services/auth.service.ts
import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { tap, map, catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import {
  ApiResponse, AuthResponse, AuthUser,
  LoginRequest, RegisterRequest, RefreshTokenRequest
} from '../models/auth.models';
import { environment } from '../../environments/environment';

const TOKEN_KEY   = 'aquaerp_token';
const REFRESH_KEY = 'aquaerp_refresh';
const USER_KEY    = 'aquaerp_user';

@Injectable({ providedIn: 'root' })
export class AuthService {

  // private readonly authApi = '/api/auth';
  private readonly authApi = `${environment.apiUrl}/auth`;

  // ── Reactive state ────────────────────────────────────────────────────────
  private _currentUser = signal<AuthUser | null>(this.loadUser());
  readonly currentUser  = this._currentUser.asReadonly();
  readonly isLoggedIn   = computed(() => this._currentUser() !== null);
  readonly isAdmin      = computed(() => this._currentUser()?.role === 'Admin');

  // SuperAdmin = platform-level flag, independent of business role.
  // When true the user ONLY sees /superadmin/* routes.
  readonly isSuperAdmin = computed(() => this._currentUser()?.isSuperAdmin === true);

  readonly userName          = computed(() => this._currentUser()?.name          ?? '');
  readonly businessName      = computed(() => this._currentUser()?.businessName  ?? '');
  readonly businessAccountId = computed(() => this._currentUser()?.businessAccountId ?? 0);
  readonly currencySymbol    = computed(() => this._currentUser()?.currencySymbol ?? '₹');
  readonly themeColor        = computed(() => this._currentUser()?.themeColor     ?? '#0057FF');

  constructor(
    private http:   HttpClient,
    private router: Router,
  ) {}

  // ── Login ─────────────────────────────────────────────────────────────────
  login(req: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<ApiResponse<AuthResponse>>(`${this.authApi}/login`, req)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Login failed.');
          return res.data;
        }),
        tap(data => this.storeSession(data)),
        catchError(err => throwError(() => this.extractError(err))),
      );
  }

  // ── Register ──────────────────────────────────────────────────────────────
  register(req: RegisterRequest): Observable<void> {
    return this.http
      .post<ApiResponse<void>>(`${this.authApi}/register`, req)
      .pipe(
        map(res => {
          if (!res.success)
            throw new Error(res.message ?? 'Registration failed.');
        }),
        catchError(err => throwError(() => this.extractError(err))),
      );
  }

  // ── Refresh token ─────────────────────────────────────────────────────────
  refresh(): Observable<AuthResponse> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this.clearSession();
      return throwError(() => new Error('No refresh token available.'));
    }
    const req: RefreshTokenRequest = { refreshToken };
    return this.http
      .post<ApiResponse<AuthResponse>>(`${this.authApi}/refresh`, req)
      .pipe(
        map(res => {
          if (!res.success || !res.data)
            throw new Error(res.message ?? 'Session expired.');
          return res.data;
        }),
        tap(data => this.storeSession(data)),
        catchError(err => {
          this.clearSession();
          return throwError(() => this.extractError(err));
        }),
      );
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  logout(): void {
    this.http
      .post<ApiResponse<void>>(`${this.authApi}/logout`, {})
      .pipe(catchError(() => throwError(() => null)))
      .subscribe({ complete: () => {} });
    this.clearSession();
    this.router.navigate(['/login']);
  }

  // ── Session helpers ───────────────────────────────────────────────────────
  storeSession(res: AuthResponse): void {
    localStorage.setItem(TOKEN_KEY,   res.token);
    localStorage.setItem(REFRESH_KEY, res.refreshToken);
    localStorage.setItem(USER_KEY,    JSON.stringify(res.user));
    this._currentUser.set(res.user);
  }

  clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    this._currentUser.set(null);
  }

  getToken(): string | null        { return localStorage.getItem(TOKEN_KEY); }
  getRefreshToken(): string | null { return localStorage.getItem(REFRESH_KEY); }

  private loadUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  }

  private extractError(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      const msg = err.error?.message;
      if (typeof msg === 'string' && msg.length > 0) return new Error(msg);
      if (err.status === 0)   return new Error('Cannot reach server. Check your connection.');
      if (err.status === 401) return new Error('Session expired. Please log in again.');
      if (err.status === 500) return new Error('Server error. Please try again later.');
    }
    if (err instanceof Error) return err;
    return new Error('An unexpected error occurred.');
  }
}