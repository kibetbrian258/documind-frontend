import { Component, computed, inject, model } from '@angular/core';

import { DocumentResponse } from '../../../core/api/api.models';
import { DocumentScope } from '../../../core/chat/chat-session';
import { DocumentsStore } from '../../../core/documents/document.store';
import { plural } from '../../../core/chat/document-scope';

/**
 * "Only search these documents" (FR-11): a checkbox for each ready document.
 * Documents still being read, or that failed, are listed but can't be ticked.
 *
 * `scope` is null when every ready document is ticked.
 */
@Component({
  selector: 'app-document-picker',
  templateUrl: './document-picker.html',
  styleUrl: './document-picker.css',
})
export class DocumentPicker {
  private readonly store = inject(DocumentsStore);

  readonly scope = model<DocumentScope>(null);

  /** Ready documents first, then those still processing or failed (Library order within each). */
  protected readonly documents = computed(() => {
    const all = this.store.documents();
    return [...all.filter((d) => d.status === 'READY'), ...all.filter((d) => d.status !== 'READY')];
  });
  private readonly readyIds = computed(() => this.store.readyDocuments().map((d) => d.id));

  protected isChecked(doc: DocumentResponse): boolean {
    if (doc.status !== 'READY') {
      return false;
    }
    const scope = this.scope();
    return scope === null || scope.includes(doc.id);
  }

  protected toggle(doc: DocumentResponse): void {
    const current = this.scope() ?? this.readyIds();
    const next = current.includes(doc.id)
      ? current.filter((id) => id !== doc.id)
      : [...current, doc.id];
    const all = this.readyIds();
    this.scope.set(
      next.length === all.length && all.every((id) => next.includes(id)) ? null : next,
    );
  }

  protected selectAll(): void {
    this.scope.set(null);
  }

  protected clear(): void {
    this.scope.set([]);
  }

  protected detail(doc: DocumentResponse): string {
    switch (doc.status) {
      case 'PROCESSING':
        return 'Still processing';
      case 'FAILED':
        return 'Failed — can’t search';
      default:
        return doc.pageCount ? plural(doc.pageCount, 'page') : '';
    }
  }
}
