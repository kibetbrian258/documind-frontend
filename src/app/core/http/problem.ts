import { HttpErrorResponse } from '@angular/common/http';

import { ProblemDetail } from '../api/api.models';

/**
 * Turns a failed HTTP call into one sentence to show the user.
 *
 * The backend sends every error as a "problem detail" with a friendly
 * `detail` message (GlobalExceptionHandler), and validation errors also list
 * each field under `errors`. Anything else gets a generic message.
 */
export function problemMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }
  if (error.status === 0) {
    return "Can't reach DocuMind right now. Check your connection and try again.";
  }
  const problem = error.error as Partial<ProblemDetail> | null;
  const firstFieldError = problem?.errors ? Object.values(problem.errors)[0] : undefined;
  return firstFieldError ?? problem?.detail ?? fallback;
}

export function httpStatus(error: unknown): number | null {
  return error instanceof HttpErrorResponse ? error.status : null;
}
