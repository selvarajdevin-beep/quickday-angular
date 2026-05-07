// import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
// import { inject } from '@angular/core';
// import { HttpRequest, HttpHandlerFn } from '@angular/common/http';
// import { catchError, switchMap, throwError, BehaviorSubject, filter, take } from 'rxjs';
// import { AuthService } from '../services/auth.service';
// import { Router } from '@angular/router';

// // Prevents multiple concurrent refresh calls
// let isRefreshing  = false;
// const refreshDone = new BehaviorSubject<string | null>(null);

// export const authInterceptor: HttpInterceptorFn = (req, next) => {
//   const auth   = inject(AuthService);
//   const router = inject(Router);

//   // Skip auth header for auth endpoints themselves
//   const isAuthEndpoint = req.url.includes('/api/auth/login')
//     || req.url.includes('/api/auth/register')
//     || req.url.includes('/api/auth/refresh');

//   const token = auth.getToken();

//   const authReq = (token && !isAuthEndpoint)
//     ? addToken(req, token)
//     : req;

//   return next(authReq).pipe(
//     catchError((err: HttpErrorResponse) => {

//       if (err.status !== 401 || isAuthEndpoint) {
//         return throwError(() => err);
//       }

//       // ── 401 — attempt token refresh ───────────────────
//       if (isRefreshing) {
//         // Wait for the ongoing refresh to finish
//         return refreshDone.pipe(
//           filter(t => t !== null),
//           take(1),
//           switchMap(newToken =>
//             next(addToken(req, newToken!))
//           )
//         );
//       }

//       isRefreshing = true;
//       refreshDone.next(null);

//       return auth.refresh().pipe(
//         switchMap(res => {
//           isRefreshing = false;
//           refreshDone.next(res.token);
//           return next(addToken(req, res.token));
//         }),
//         catchError(refreshErr => {
//           isRefreshing = false;
//           auth.clearSession();
//           router.navigate(['/login']);
//           return throwError(() => refreshErr);
//         })
//       );
//     })
//   );
// };

// function addToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
//   return req.clone({
//     setHeaders: { Authorization: `Bearer ${token}` }
//   });
// }

import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { catchError, switchMap, throwError, BehaviorSubject, filter, take } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

let isRefreshing  = false;
const refreshDone = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const isAuthEndpoint =
    req.url.includes('/api/auth/login')    ||
    req.url.includes('/api/auth/register') ||
    req.url.includes('/api/auth/refresh');

  const token   = auth.getToken();
  const authReq = (token && !isAuthEndpoint) ? addToken(req, token) : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {

      // Only intercept 401s on non-auth endpoints
      if (err.status !== 401 || isAuthEndpoint) {
        return throwError(() => err);
      }

      // ✅ No token at all — nothing to refresh, go straight to login
      if (!auth.getToken() && !auth.getRefreshToken()) {
        auth.clearSession();
        router.navigate(['/login']);
        return throwError(() => err);
      }

      // Another request already triggered refresh — queue behind it
      if (isRefreshing) {
        return refreshDone.pipe(
          filter(t => t !== null),
          take(1),
          switchMap(newToken => next(addToken(req, newToken!)))
        );
      }

      isRefreshing = true;
      refreshDone.next(null);

      return auth.refresh().pipe(
        switchMap(res => {
          isRefreshing = false;
          refreshDone.next(res.token);
          // ✅ Retry the original request with the new token
          return next(addToken(req, res.token));
        }),
        catchError(refreshErr => {
          isRefreshing = false;
          refreshDone.next(null); // ✅ Unblock any queued requests before navigating
          auth.clearSession();
          router.navigate(['/login']);
          return throwError(() => refreshErr);
        })
      );
    })
  );
};

function addToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}