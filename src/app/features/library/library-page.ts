import { Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { API, DocumentResponse } from '../../core/api/api.models';
import {
  fileKindFromContentType,
  formatAdded,
  formatSize,
} from '../../core/documents/document-format';
import { DocumentsStore, MAX_DOCUMENTS } from '../../core/documents/document.store';
import { problemMessage } from '../../core/http/problem';
import { ConfirmDialog, ConfirmDialogData } from '../../shared/confirm-dialog';

/**
 * The Library (US-2, US-3, US-10): upload documents, watch them get processed,
 * and retry or delete them.
 */
@Component({
  selector: 'app-library-page',
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: './library-page.html',
  styleUrl: './library-page.css',
})
export class LibraryPage {
  protected readonly store = inject(DocumentsStore);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  protected readonly maxDocuments = MAX_DOCUMENTS;
  protected readonly formatSize = formatSize;
  protected readonly formatAdded = formatAdded;
  protected readonly kindOf = (doc: DocumentResponse) => fileKindFromContentType(doc.contentType);

  /** Text in the search box. */
  protected readonly query = signal('');
  /** True while a file is dragged over the drop zone. */
  protected readonly dragging = signal(false);
  /** Documents with a retry or delete in progress, so their buttons are disabled. */
  private readonly busy = signal<ReadonlySet<string>>(new Set());

  protected readonly visibleDocuments = computed(() => {
    const query = this.query().trim().toLowerCase();
    const documents = this.store.documents();
    return query ? documents.filter((d) => d.fileName.toLowerCase().includes(query)) : documents;
  });

  protected isBusy(id: string): boolean {
    return this.busy().has(id);
  }

  protected fileUrl(doc: DocumentResponse): string {
    return `${API}/documents/${doc.id}/file`;
  }

  // ------------------------------------------------------------ adding files

  protected onFilesChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.store.upload(Array.from(input.files));
    }
    input.value = ''; // so choosing the same file again still triggers a change
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault(); // allows dropping
    this.dragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    // Moving over a child element also fires dragleave; only react when leaving the zone itself.
    const zone = event.currentTarget as HTMLElement;
    if (!zone.contains(event.relatedTarget as Node | null)) {
      this.dragging.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault(); // otherwise the browser opens the file
    this.dragging.set(false);
    if (event.dataTransfer?.files) {
      this.store.upload(Array.from(event.dataTransfer.files));
    }
  }

  // ------------------------------------------------------------ row actions

  protected ask(doc: DocumentResponse): void {
    void this.router.navigate(['/chat'], { queryParams: { documents: doc.id } });
  }

  protected async retry(doc: DocumentResponse): Promise<void> {
    await this.whileBusy(doc.id, async () => {
      try {
        await this.store.retry(doc.id);
      } catch (error) {
        this.store.addNotice(doc.fileName, `couldn't be retried. ${problemMessage(error)}`);
      }
    });
  }

  protected async confirmDelete(doc: DocumentResponse): Promise<void> {
    const dialog = this.dialog.open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
      width: '440px',
      data: {
        title: 'Delete this document?',
        message: `“${doc.fileName}” will be removed, and answers will no longer use it. This can't be undone.`,
        confirmLabel: 'Delete',
      },
    });
    if (!(await firstValueFrom(dialog.afterClosed()))) {
      return;
    }
    await this.whileBusy(doc.id, async () => {
      try {
        await this.store.delete(doc.id);
      } catch (error) {
        this.store.addNotice(doc.fileName, `couldn't be deleted. ${problemMessage(error)}`);
      }
    });
  }

  private async whileBusy(id: string, action: () => Promise<void>): Promise<void> {
    this.busy.update((ids) => new Set(ids).add(id));
    try {
      await action();
    } finally {
      this.busy.update((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
    }
  }
}
