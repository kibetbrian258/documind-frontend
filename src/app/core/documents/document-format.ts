/**
 * Small display helpers for documents: file kind badges, sizes and dates.
 */

export type FileKind = 'PDF' | 'DOCX' | 'TXT';

/** The kind from a file name, or null if DocuMind can't read that type. */
export function fileKindFromName(fileName: string): FileKind | null {
  const extension = fileName.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'pdf':
      return 'PDF';
    case 'docx':
      return 'DOCX';
    case 'txt':
      return 'TXT';
    default:
      return null;
  }
}

/** The kind from the content type the backend stored. */
export function fileKindFromContentType(contentType: string): FileKind {
  if (contentType === 'application/pdf') {
    return 'PDF';
  }
  if (contentType.includes('wordprocessingml')) {
    return 'DOCX';
  }
  return 'TXT';
}

/** "18 KB", "4.2 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MONTH_DAY = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** "Just now", "Today", "Yesterday", "Oct 28", or "Oct 28, 2025" for older years. */
export function formatAdded(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (now.getTime() - date.getTime() < 5 * 60 * 1000) {
    return 'Just now';
  }
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (date.getTime() >= startOfToday) {
    return 'Today';
  }
  if (date.getTime() >= startOfToday - dayMs) {
    return 'Yesterday';
  }
  return date.getFullYear() === now.getFullYear()
    ? MONTH_DAY.format(date)
    : MONTH_DAY_YEAR.format(date);
}
