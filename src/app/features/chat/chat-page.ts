import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';

import { FeedbackRating } from '../../core/api/api.models';
import { AuthService } from '../../core/auth/auth.service';
import { ConversationActions, displayTitle } from '../../core/chat/conversation-actions';
import { ConversationsStore } from '../../core/chat/conversations.store';
import {
  AnswerItem,
  AskOutcome,
  ChatSession,
  DocumentScope,
  NEW_CHAT,
} from '../../core/chat/chat-session';
import { effectiveScope } from '../../core/chat/document-scope';
import { DocumentsStore } from '../../core/documents/document.store';
import { problemMessage } from '../../core/http/problem';
import { AnswerView } from './answer-view/answer-view';
import { Composer } from './composer/composer';
import { DailyLimit } from './daily-limit/daily-limit';
import { SourcePanel } from './source-panel/source-panel';
import { sourceTitle } from './source-title';

/**
 * The chat (US-4 to US-6, US-9, US-11):
 * - /chat         a new chat: the big question box and the document picker
 * - /chat/:id     a conversation, with the source panel on the right
 *
 * /chat?documents=<id> (from the Library) starts with just that document ticked.
 */
@Component({
  selector: 'app-chat-page',
  imports: [
    RouterLink,
    MatIconModule,
    MatTooltipModule,
    Composer,
    AnswerView,
    SourcePanel,
    DailyLimit,
  ],
  templateUrl: './chat-page.html',
  styleUrl: './chat-page.css',
})
export class ChatPage {
  private readonly session = inject(ChatSession);
  private readonly conversations = inject(ConversationsStore);
  private readonly actions = inject(ConversationActions);
  private readonly documentsStore = inject(DocumentsStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  /** Route parameter (chat/:id); undefined on the new-chat screen. */
  readonly id = input<string>();
  /** Query parameter from the Library's "Ask about this document". */
  readonly documents = input<string>();

  private readonly composer = viewChild(Composer);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  // ------------------------------------------------------------ documents and limits

  private readonly readyIds = computed(() => this.documentsStore.readyDocuments().map((d) => d.id));
  protected readonly readyCount = computed(() => this.readyIds().length);
  protected readonly user = this.auth.user;
  protected readonly limitReached = computed(
    () => (this.auth.user()?.questionsRemainingToday ?? 1) <= 0,
  );

  protected readonly libraryEmpty = computed(
    () => this.documentsStore.status() === 'loaded' && this.documentsStore.count() === 0,
  );

  protected readonly blockedReason = computed(() => {
    if (this.limitReached()) {
      return 'Asking is paused until midnight';
    }
    if (this.libraryEmpty()) {
      return 'Add a document to your Library to start asking';
    }
    if (this.documentsStore.status() === 'loaded' && this.readyCount() === 0) {
      return 'Your documents are still being read…';
    }
    return null;
  });

  // ------------------------------------------------------------ the conversation

  private readonly scopeKey = computed(() => this.id() ?? NEW_CHAT);
  protected readonly scope = computed(() => this.session.scope(this.scopeKey()));

  protected readonly thread = computed(() => {
    const id = this.id();
    return id ? this.session.thread(id) : undefined;
  });
  protected readonly items = computed(() => this.thread()?.items ?? []);
  protected readonly answering = computed(() => {
    const id = this.id();
    return id ? this.session.isAnswering(id) : false;
  });
  protected readonly title = computed(() => displayTitle(this.conversations.activeConversation()));

  /** For screen readers: the words stream silently; these short updates are announced. */
  protected readonly liveStatus = computed(() => {
    const last = this.items().at(-1);
    if (last?.kind !== 'answer') {
      return '';
    }
    switch (last.phase) {
      case 'searching':
      case 'reading':
        return 'Searching your documents…';
      case 'writing':
        return 'Writing the answer…';
      case 'done':
        return last.notFound ? "Couldn't find that in your documents." : 'Answer ready.';
      case 'error':
        return last.error?.title ?? 'Something went wrong.';
      case 'stopped':
        return 'Stopped.';
    }
  });

  protected readonly draft = signal('');
  protected readonly creating = signal(false);

  /** "Try asking" ideas, made from the user's own ready documents. */
  protected readonly suggestions = computed(() => {
    const names = this.documentsStore
      .readyDocuments()
      .slice(0, 3)
      .map((d) => sourceTitle(d.fileName));
    if (names.length === 0) {
      return [];
    }
    const pick = (i: number) => names[i % names.length];
    return [
      `Summarise the main points of ${pick(0)}`,
      `What are the key terms defined in ${pick(1)}?`,
      `What should I remember most from ${pick(2)}?`,
    ];
  });

  // ------------------------------------------------------------ source panel

  protected readonly selected = signal<{ answerKey: string; number: number } | null>(null);

  protected readonly selectedAnswer = computed(() => {
    const selected = this.selected();
    if (!selected) {
      return undefined;
    }
    const answer = this.items().find(
      (item) => item.kind === 'answer' && item.key === selected.answerKey,
    );
    return answer?.kind === 'answer' ? answer : undefined;
  });

  protected readonly selectedIndex = computed(() => {
    const number = this.selected()?.number;
    return this.selectedAnswer()?.citations.findIndex((c) => c.number === number) ?? -1;
  });

  /** Keeps the newest words in view, unless the user has scrolled up to read. */
  private stickToBottom = true;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.conversations.setActive(id ?? null);
        this.selected.set(null);
        this.stickToBottom = true;
        if (id) {
          void this.session.open(id);
        }
      });
    });

    effect(() => {
      const ids = this.documents();
      if (ids && !this.id()) {
        untracked(() => this.session.setScope(NEW_CHAT, ids.split(',').filter(Boolean)));
      }
    });

    afterRenderEffect(() => {
      this.items();
      const scroller = this.scroller()?.nativeElement;
      if (scroller && this.stickToBottom) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });

    inject(DestroyRef).onDestroy(() => this.conversations.setActive(null));
  }

  // ------------------------------------------------------------ asking

  protected setScope(scope: DocumentScope): void {
    this.session.setScope(this.scopeKey(), scope);
  }

  /** New chat: create the conversation, start the answer, then open the conversation's page. */
  protected async sendFromHome(question: string): Promise<void> {
    if (this.creating()) {
      return;
    }
    this.creating.set(true);
    try {
      const conversation = await this.conversations.create();
      this.session.setScope(conversation.id, this.session.scope(NEW_CHAT));
      this.session.setScope(NEW_CHAT, null);
      this.session.startEmpty(conversation.id);
      this.draft.set('');
      void this.askIn(conversation.id, question);
      await this.router.navigate(['/chat', conversation.id]);
    } catch (error) {
      this.snackBar.open(problemMessage(error, "Couldn't start a new chat. Try again."), 'OK', {
        duration: 5000,
      });
    } finally {
      this.creating.set(false);
    }
  }

  protected async send(question: string): Promise<void> {
    const id = this.id();
    if (!id) {
      return;
    }
    this.draft.set('');
    this.stickToBottom = true;
    if ((await this.askIn(id, question)) === 'limit-reached') {
      this.draft.set(question); // nothing was asked; keep the question for tomorrow
    }
  }

  protected stop(): void {
    const id = this.id();
    if (id) {
      this.session.stop(id);
    }
  }

  protected retry(answer: AnswerItem): void {
    const id = this.id();
    if (id) {
      this.stickToBottom = true;
      void this.session.retry(id, answer);
    }
  }

  /** "Search all 12 documents" after "not found" in a few. */
  protected searchAll(answer: AnswerItem): void {
    const id = this.id();
    if (id) {
      this.session.setScope(id, null);
      this.stickToBottom = true;
      void this.askIn(id, answer.question);
    }
  }

  protected rate(answer: AnswerItem, rating: FeedbackRating): void {
    const id = this.id();
    if (id) {
      void this.session.rate(answer, id, rating);
    }
  }

  protected useSuggestion(text: string): void {
    this.draft.set(text);
    this.composer()?.focus();
  }

  private askIn(conversationId: string, question: string): Promise<AskOutcome> {
    const ids = effectiveScope(this.session.scope(conversationId), this.readyIds());
    return this.session.ask(conversationId, question, ids, ids ? ids.length : this.readyCount());
  }

  // ------------------------------------------------------------ header actions

  protected rename(): void {
    const conversation = this.conversations.activeConversation();
    if (conversation) {
      void this.actions.rename(conversation);
    }
  }

  protected delete(): void {
    const conversation = this.conversations.activeConversation();
    if (conversation) {
      void this.actions.delete(conversation);
    }
  }

  protected reload(): void {
    const id = this.id();
    if (id) {
      void this.session.open(id);
    }
  }

  // ------------------------------------------------------------ sources

  protected openSource(answer: AnswerItem, number: number): void {
    this.selected.set({ answerKey: answer.key, number });
  }

  protected showSourceAt(index: number): void {
    const answer = this.selectedAnswer();
    const citation = answer?.citations[index];
    if (answer && citation) {
      this.selected.set({ answerKey: answer.key, number: citation.number });
    }
  }

  protected activeSourceFor(answer: AnswerItem): number | null {
    const selected = this.selected();
    return selected?.answerKey === answer.key ? selected.number : null;
  }

  protected onScroll(): void {
    const scroller = this.scroller()?.nativeElement;
    if (scroller) {
      this.stickToBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
    }
  }
}
