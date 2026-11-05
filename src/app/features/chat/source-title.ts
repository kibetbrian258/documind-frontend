/** A document's name without ".pdf", ".docx" or ".txt", for source cards. */
export function sourceTitle(fileName: string): string {
  return fileName.replace(/\.(pdf|docx|txt)$/i, '');
}
