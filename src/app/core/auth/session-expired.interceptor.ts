import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { API } from '../api/api.models';
import { AuthService } from './auth.service';

/**
 * If the backend answers 401 while someone is using the app, their login has
 * ended (the 7 days passed, or they signed out in another tab). Send them to
 * the sign-in page, and bring them back to the same page afterwards.
 *
 * Sign-in and register calls are skipped: a 401 there just means a wrong password.
 */
export const sessionExpiredInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      const isAuthCall = request.url.startsWith(`${API}/auth/`);
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !isAuthCall &&
        auth.isSignedIn()
      ) {
        auth.endSession();
        void router.navigate(['/login'], { queryParams: { returnUrl: router.url, expired: true } });
      }
      return throwError(() => error);
    }),
  );
};
