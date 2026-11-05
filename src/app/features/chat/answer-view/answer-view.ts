import { Clipboard } from '@angular/cdk/clipboard';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, DestroyRef, inject, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

import { CitationResponse, FeedbackRating } from '../../../core/api/api.models';
import { parseAnswer, plainAnswer } from '../../../core/chat/answer-text';
import { AnswerItem } from '../../../core/chat/chat-session';
import { plural } from '../../../core/chat/document-scope';
import { sourceTitle } from '../source-title';

/**
 * One answer, in whichever state it is in (design: "Answer states"):
 * working steps, words arriving, the finished answer with its sources,
 * "not found", or "couldn't reach the AI".
 */
@Component({
  selector: 'app-answer-view',
  imports: [NgTemplateOutlet, MatIconModule, MatTooltipModule, RouterLink],
  templateUrl: './answer-view.html',
  styleUrl: './answer-view.css',
})
export class AnswerView {
  private readonly clipboard = inject(Clipboard);

  readonly answer = input.required<AnswerItem>();
  /** The citation number open in the source panel, if it belongs to this answer. */
  readonly activeSource = input<number | null>(null);
  /** All ready documents, for "Search all 12 documents". */
  readonly readyCount = input(0);

  readonly openSource = output<number>();
  readonly retry = output<void>();
  readonly searchAll = output<void>();
  readonly rate = output<FeedbackRating>();

  protected readonly copied = signal(false);
  protected readonly sourceTitle = sourceTitle;
  protected readonly plural = plural;

  protected readonly blocks = computed(() => parseAnswer(this.answer().text));

  private readonly byNumber = computed(
    () => new Map(this.answer().citations.map((citation) => [citation.number, citation])),
  );

  /** "Read 4 passages from 2 documents": what the finished answer is based on. */
  protected readonly basis = computed(() => {
    const citations = this.answer().citations;
    const documents = new Set(citations.map((c) => c.documentId)).size;
    return `Read ${plural(citations.length, 'passage')} from ${plural(documents, 'document')}`;
  });

  protected readonly notFoundDetail = computed(() => {
    const searched = this.answer().documentsSearched;
    const start =
      searched === null
        ? 'Nothing in your documents matched closely enough to answer from'
        : `I searched ${plural(searched, 'document')} and nothing matched closely enough to answer from`;
    return `${start}, so I won't guess. Try rewording, or add the document that covers it.`;
  });

  /** Offer "Search all" only when the question was limited to some of the documents. */
  protected readonly canSearchAll = computed(() => {
    const answer = this.answer();
    return (
      answer.documentIds !== null &&
      answer.question !== '' &&
      this.readyCount() > answer.documentIds.length
    );
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copiedTimer));
  }

  private copiedTimer?: ReturnType<typeof setTimeout>;

  protected citation(number: number): CitationResponse | undefined {
    return this.byNumber().get(number);
  }

  /** "1 · p.14", or just "1" for documents without pages and while the answer is still streaming. */
  protected chipLabel(number: number): string {
    const page = this.citation(number)?.page;
    return page ? `${number} · p.${page}` : `${number}`;
  }

  protected percent(similarity: number): string {
    return `${Math.round(similarity * 100)}%`;
  }

  protected copy(): void {
    if (this.clipboard.copy(plainAnswer(this.answer().text))) {
      this.copied.set(true);
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 2000);
    }
  }
}
