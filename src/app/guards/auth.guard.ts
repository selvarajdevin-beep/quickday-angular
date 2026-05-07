// // src/app/guards/auth.guard.ts
// import { inject } from '@angular/core';
// import {
//   CanActivateFn, Router,
//   ActivatedRouteSnapshot, RouterStateSnapshot
// } from '@angular/router';
// import { Observable, of } from 'rxjs';
// import { map, catchError, take } from 'rxjs/operators';
// import { AuthService }          from '../services/auth.service';
// import { SharedStateService, UserRole } from '../services/shared-state.service';

// // ── authGuard ─────────────────────────────────────────────────────────────────
// // Used on the Shell route (the layout wrapper).
// // • Not logged in            → /login
// // • SuperAdmin on non-SA/non-account route → /superadmin/dashboard
// // • Everyone else            → allow through
// export const authGuard: CanActivateFn = (
//   _route: ActivatedRouteSnapshot,
//   state:  RouterStateSnapshot,
// ) => {
//   const auth   = inject(AuthService);
//   const router = inject(Router);

//   // Not logged in → login
//   if (!auth.isLoggedIn()) {
//     router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
//     return false;
//   }

//   // SuperAdmin trying to access a regular route → SA dashboard
//   const isSA      = auth.isSuperAdmin();
//   const isSARoute = state.url.startsWith('/superadmin');
//   const isAcct    = state.url.startsWith('/account');

//   if (isSA && !isSARoute && !isAcct) {
//     router.navigate(['/superadmin/dashboard']);
//     return false;
//   }

//   return true;
// };

// // ── guestGuard ────────────────────────────────────────────────────────────────
// // Used on /login and /register — already logged-in users are redirected.
// // SuperAdmin goes to their own dashboard, regular users to /dashboard.
// export const guestGuard: CanActivateFn = () => {
//   const auth   = inject(AuthService);
//   const router = inject(Router);

//   if (!auth.isLoggedIn()) return true;

//   // Redirect to appropriate home
//   router.navigate([auth.isSuperAdmin() ? '/superadmin/dashboard' : '/dashboard']);
//   return false;
// };

// // ── adminGuard ────────────────────────────────────────────────────────────────
// // Used on routes that require at least Admin role.
// export const adminGuard: CanActivateFn = () => {
//   const auth   = inject(AuthService);
//   const router = inject(Router);

//   if (auth.isAdmin()) return true;

//   router.navigate(['/dashboard']);
//   return false;
// };

// // ── moduleGuard ───────────────────────────────────────────────────────────────
// // Used on individual child routes to enforce DB-driven module permissions.
// // SuperAdmin bypasses module checks (they only access SA routes anyway,
// // but /account is allowed for everyone).
// export const moduleGuard: CanActivateFn = (
//   route: ActivatedRouteSnapshot,
// ): Observable<boolean> | boolean => {
//   const auth   = inject(AuthService);
//   const shared = inject(SharedStateService);
//   const router = inject(Router);

//   const moduleName = route.data?.['module'] as string | undefined;
//   if (!moduleName) return true;

//   // SuperAdmin can always access the Account page (no module check needed)
//   if (auth.isSuperAdmin()) return true;

//   const role = (auth.currentUser()?.role ?? 'Worker') as UserRole;

//   // Load permissions then check — mirrors ShellComponent logic
//   const loader$ = role === 'Admin'
//     ? shared.getSettings().pipe(map(() => void 0), catchError(() => of(void 0)))
//     : shared.loadMyRolePermissions().pipe(catchError(() => of(void 0)));

//   return loader$.pipe(
//     take(1),
//     map(() => {
//       const visible = shared.visibleModulesForRole(role);
//       if (visible.includes(moduleName)) return true;
//       router.navigate(['/dashboard']);
//       return false;
//     }),
//     catchError(() => {
//       // Fail open: if the API is down, allow access using cached defaults
//       const visible = shared.visibleModulesForRole(role);
//       if (visible.includes(moduleName)) return of(true);
//       router.navigate(['/dashboard']);
//       return of(false);
//     }),
//   );
// };

// // ── superAdminGuard ───────────────────────────────────────────────────────────
// // Used on /superadmin/* routes.
// // • Not logged in   → /login
// // • Not SuperAdmin  → /dashboard
// export const superAdminGuard: CanActivateFn = () => {
//   const auth   = inject(AuthService);
//   const router = inject(Router);

//   if (!auth.isLoggedIn()) {
//     router.navigate(['/login']);
//     return false;
//   }

//   if (!auth.isSuperAdmin()) {
//     router.navigate(['/dashboard']);
//     return false;
//   }

//   return true;
// };


import { inject } from '@angular/core';
import {
  CanActivateFn, Router,
  ActivatedRouteSnapshot, RouterStateSnapshot
} from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, catchError, take, switchMap } from 'rxjs/operators';
import { AuthService }          from '../services/auth.service';
import { SharedStateService, UserRole } from '../services/shared-state.service';

// ── authGuard ─────────────────────────────────────────────────────────────────
export const authGuard: CanActivateFn = (
  _route: ActivatedRouteSnapshot,
  state:  RouterStateSnapshot,
) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    // ✅ Check if a refresh token exists before giving up —
    //    the access token may have expired but session is still recoverable
    if (auth.getRefreshToken()) {
      return auth.refresh().pipe(
        take(1),
        map(() => {
          return _checkAuthState(auth, router, state);
        }),
        catchError(() => {
          // Refresh failed — session truly expired
          router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
          return of(false);
        })
      );
    }
    router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  return _checkAuthState(auth, router, state);
};

// Extracted so both the sync and async paths share the same logic
function _checkAuthState(
  auth:   AuthService,
  router: Router,
  state:  RouterStateSnapshot,
): boolean {
  const isSA      = auth.isSuperAdmin();
  const isSARoute = state.url.startsWith('/superadmin');
  const isAcct    = state.url.startsWith('/account');

  if (isSA && !isSARoute && !isAcct) {
    router.navigate(['/superadmin/dashboard']);
    return false;
  }
  return true;
}

// ── guestGuard ────────────────────────────────────────────────────────────────
export const guestGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) return true;

  router.navigate([auth.isSuperAdmin() ? '/superadmin/dashboard' : '/dashboard']);
  return false;
};

// ── adminGuard ────────────────────────────────────────────────────────────────
export const adminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (auth.isAdmin()) return true;
  router.navigate(['/dashboard']);
  return false;
};

// ── moduleGuard ───────────────────────────────────────────────────────────────
export const moduleGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
): Observable<boolean> | boolean => {
  const auth   = inject(AuthService);
  const shared = inject(SharedStateService);
  const router = inject(Router);

  const moduleName = route.data?.['module'] as string | undefined;
  if (!moduleName) return true;

  if (auth.isSuperAdmin()) return true;

  const role = (auth.currentUser()?.role ?? 'Worker') as UserRole;

  const loader$ = role === 'Admin'
    ? shared.getSettings().pipe(map(() => void 0), catchError(() => of(void 0)))
    : shared.loadMyRolePermissions().pipe(catchError(() => of(void 0)));

  return loader$.pipe(
    take(1),
    map(() => {
      const visible = shared.visibleModulesForRole(role);
      if (visible.includes(moduleName)) return true;
      router.navigate(['/dashboard']);
      return false;
    }),
    catchError(() => {
      const visible = shared.visibleModulesForRole(role);
      if (visible.includes(moduleName)) return of(true);
      router.navigate(['/dashboard']);
      return of(false);
    }),
  );
};

// ── superAdminGuard ───────────────────────────────────────────────────────────
export const superAdminGuard: CanActivateFn = (
  _route: ActivatedRouteSnapshot,
  state:  RouterStateSnapshot,
) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  // ✅ Not logged in but refresh token exists — try to recover session first
  if (!auth.isLoggedIn()) {
    if (auth.getRefreshToken()) {
      return auth.refresh().pipe(
        take(1),
        map(() => {
          if (!auth.isSuperAdmin()) {
            router.navigate(['/dashboard']);
            return false;
          }
          return true;
        }),
        catchError(() => {
          router.navigate(['/login']);
          return of(false);
        })
      );
    }
    router.navigate(['/login']);
    return false;
  }

  if (!auth.isSuperAdmin()) {
    router.navigate(['/dashboard']);
    return false;
  }

  return true;
};