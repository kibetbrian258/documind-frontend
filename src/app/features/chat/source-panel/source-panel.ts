import { Component, computed, inject, input, model, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { API, CitationResponse } from '../../../core/api/api.models';
import { DocumentsStore } from '../../../core/documents/document.store';
import { sourceTitle } from '../source-title';

/**
 * The passage behind a citation (US-5): beside the chat on wide screens, as
 * a bottom sheet on phones. The highlighted text is exactly what the answer used.
 */
@Component({
  selector: 'app-source-panel',
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: './source-panel.html',
  styleUrl: './source-panel.css',
  host: {
    '(document:keydown.escape)': 'close.emit()',
  },
})
export class SourcePanel {
  private readonly documents = inject(DocumentsStore);

  /** The answer's citations; `index` says which one is shown. */
  readonly citations = input.required<CitationResponse[]>();
  readonly index = model.required<number>();
  readonly close = output<void>();

  protected readonly citation = computed(() => this.citations()[this.index()]);
  protected readonly total = computed(() => this.citations().length);
  protected readonly title = computed(() => sourceTitle(this.citation().fileName));
  protected readonly match = computed(
    () => `${Math.round(this.citation().similarity * 100)}% match`,
  );

  private readonly document = computed(() =>
    this.documents.documents().find((d) => d.id === this.citation().documentId),
  );

  /** False once the document has been deleted from the Library. */
  protected readonly canOpen = computed(
    () => this.documents.status() !== 'loaded' || this.document() !== undefined,
  );

  /** "page 14 of 32", "page 14", or null for DOCX and TXT. */
  protected readonly pageText = computed(() => {
    const page = this.citation().page;
    if (!page) {
      return null;
    }
    const pages = this.document()?.pageCount;
    return pages ? `page ${page} of ${pages}` : `page ${page}`;
  });

  /** The same for the phone sheet, where it starts the line: "Page 14 of 32". */
  protected readonly pageLabel = computed(() => {
    const text = this.pageText();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : null;
  });

  /** PDF viewers in browsers understand #page=N and open at that page. */
  protected readonly fileUrl = computed(() => {
    const { documentId, page } = this.citation();
    return `${API}/documents/${documentId}/file${page ? `#page=${page}` : ''}`;
  });

  protected readonly openLabel = computed(() => {
    const page = this.citation().page;
    return page ? `Open page ${page}` : 'Open document';
  });

  protected previous(): void {
    this.index.update((i) => (i - 1 + this.total()) % this.total());
  }

  protected next(): void {
    this.index.update((i) => (i + 1) % this.total());
  }
}
