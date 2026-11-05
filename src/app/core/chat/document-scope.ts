import { DocumentScope } from './chat-session';

/**
 * The documents a question will actually search, given the user's choice and
 * the documents that are ready now.
 *
 * - null: all ready documents (the request then sends no documentIds)
 * - a list: just these; an empty list means nothing is selected
 *
 * Chosen documents that were deleted since are dropped. If that leaves none,
 * it falls back to all, rather than silently searching nothing.
 */
export function effectiveScope(scope: DocumentScope, readyIds: readonly string[]): DocumentScope {
  if (scope === null) {
    return null;
  }
  if (scope.length === 0) {
    return [];
  }
  const ready = new Set(readyIds);
  const chosen = scope.filter((id) => ready.has(id));
  if (chosen.length === 0 || chosen.length === readyIds.length) {
    return null;
  }
  return chosen;
}

/** The text on the scope chip, e.g. "Searching 3 of 9 ready documents". */
export function scopeLabel(scope: DocumentScope, readyCount: number): string {
  if (readyCount === 0) {
    return 'No ready documents yet';
  }
  if (scope === null) {
    return readyCount === 1
      ? 'Searching your 1 ready document'
      : `Searching all ${readyCount} ready documents`;
  }
  if (scope.length === 0) {
    return 'No documents selected';
  }
  return `Searching ${scope.length} of ${readyCount} ready documents`;
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}
