import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { sessionExpiredInterceptor } from './core/auth/session-expired.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),

    // withComponentInputBinding: route data, path params and query params
    // (e.g. ?returnUrl=...) arrive as component inputs.
    provideRouter(routes, withComponentInputBinding()),

    // HttpClient's default engine (XMLHttpRequest) is kept on purpose: it reports upload
    // progress, which withFetch() can't. The chat's streamed answers use fetch directly.
    provideHttpClient(
      // CSRF protection (matches Spring Security's csrf.spa()): Angular copies the
      // XSRF-TOKEN cookie into an X-XSRF-TOKEN header on every POST, PATCH and DELETE.
      withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
      withInterceptors([sessionExpiredInterceptor]),
    ),

    // Before the first page shows: get the CSRF cookie and find out who is signed in,
    // so the route guards already know.
    provideAppInitializer(() => inject(AuthService).initialize()),
  ],
};
