import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Route guards decide whether a page may open. They only steer the user to
 * the right page; the real protection is the backend, which checks the login
 * and role on every API call.
 */

/** Signed-in users only; everyone else goes to sign in, then comes back here. */
export const signedInGuard: CanActivateFn = (_route, state) => {
  if (inject(AuthService).isSignedIn()) {
    return true;
  }
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Sign-in and create-account pages: already signed-in users go straight to the app. */
export const signedOutGuard: CanActivateFn = () => {
  if (!inject(AuthService).isSignedIn()) {
    return true;
  }
  return inject(Router).createUrlTree(['/chat']);
};

/** Admin pages: only for ADMIN accounts. */
export const adminGuard: CanActivateFn = () => {
  if (inject(AuthService).isAdmin()) {
    return true;
  }
  return inject(Router).createUrlTree(['/chat']);
};
