import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Service, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { API, CitationResponse, FeedbackRating, MessageResponse } from '../api/api.models';
import { AuthService } from '../auth/auth.service';
import { AnswerStreamClient, AskRefusedError } from './answer-stream';
import { ConversationsStore } from './conversations.store';

/**
 * Where an answer is:
 *   searching -> reading (passages found, AI getting ready) -> writing (words arriving) -> done
 * or error, or stopped (the user pressed Stop).
 */
export type AnswerPhase = 'searching' | 'reading' | 'writing' | 'done' | 'error' | 'stopped';

export interface QuestionItem {
  kind: 'question';
  key: string;
  text: string;
}

export interface AnswerItem {
  kind: 'answer';
  key: string;
  /** Set once the answer is saved; needed for thumbs up/down. */
  messageId: string | null;
  phase: AnswerPhase;
  text: string;
  citations: CitationResponse[];
  notFound: boolean;
  feedback: FeedbackRating | null;
  /** From the "searched" event; null for answers loaded from history. */
  passagesFound: number | null;
  /** How many documents were searched; null for answers loaded from history. */
  documentsSearched: number | null;
  /** The question and document choice, so "Try again" and "Search all" can ask again. */
  question: string;
  documentIds: string[] | null;
  error: { title: string; detail: string } | null;
}

export type ThreadItem = QuestionItem | AnswerItem;

export interface Thread {
  status: 'loading' | 'ready' | 'error';
  items: ThreadItem[];
}

/** Which documents to search: null = all ready documents, otherwise these ids. */
export type DocumentScope = string[] | null;

/** What happened when asking, for the page to react to. */
export type AskOutcome = 'started' | 'limit-reached' | 'refused';

/** The key used for the new-chat screen's document choice. */
export const NEW_CHAT = 'new';

const AI_UNREACHABLE = {
  title: "The answer service didn't respond.",
  detail: "We tried twice. This didn't use up a question — try again in a moment.",
};

/**
 * Everything happening inside conversations: the messages on screen, answers
 * streaming in, Stop, Try again and feedback.
 *
 * It lives in a service rather than in the chat page so an answer keeps
 * streaming while the user looks at another page, and is still there when
 * they come back.
 */
@Service()
export class ChatSession {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly conversations = inject(ConversationsStore);
  private readonly stream = inject(AnswerStreamClient);

  private readonly threadMap = signal<Readonly<Record<string, Thread>>>({});
  private readonly scopeMap = signal<Readonly<Record<string, DocumentScope>>>({});
  private readonly running = new Map<string, AbortController>();
  private nextKey = 0;

  readonly threads = this.threadMap.asReadonly();

  constructor() {
    effect(() => {
      if (!this.auth.isSignedIn()) {
        untracked(() => this.reset());
      }
    });
  }

  thread(conversationId: string): Thread | undefined {
    return this.threadMap()[conversationId];
  }

  /** True while an answer is being written in this conversation. */
  isAnswering(conversationId: string): boolean {
    const last = this.thread(conversationId)?.items.at(-1);
    return last?.kind === 'answer' && isInProgress(last.phase);
  }

  readonly anyAnswering = computed(() =>
    Object.values(this.threadMap()).some((thread) => {
      const last = thread.items.at(-1);
      return last?.kind === 'answer' && isInProgress(last.phase);
    }),
  );

  // ------------------------------------------------------------ document choice

  scope(key: string): DocumentScope {
    return this.scopeMap()[key] ?? null;
  }

  setScope(key: string, scope: DocumentScope): void {
    this.scopeMap.update((map) => ({ ...map, [key]: scope }));
  }

  // ------------------------------------------------------------ loading

  /** Loads a conversation's messages the first time it is opened. */
  async open(conversationId: string): Promise<void> {
    const existing = this.thread(conversationId);
    if (existing && existing.status !== 'error') {
      return;
    }
    this.setThread(conversationId, { status: 'loading', items: [] });
    try {
      const messages = await firstValueFrom(
        this.http.get<MessageResponse[]>(`${API}/conversations/${conversationId}/messages`),
      );
      // An answer may have started while loading (new conversation); keep it.
      if (this.thread(conversationId)?.status === 'loading') {
        this.setThread(conversationId, {
          status: 'ready',
          items: messages.map((m) => this.fromMessage(m)),
        });
      }
    } catch {
      this.setThread(conversationId, { status: 'error', items: [] });
    }
  }

  /** A conversation that was just created has no messages to load. */
  startEmpty(conversationId: string): void {
    this.setThread(conversationId, { status: 'ready', items: [] });
  }

  forget(conversationId: string): void {
    this.running.get(conversationId)?.abort();
    this.threadMap.update(({ [conversationId]: _removed, ...rest }) => rest);
  }

  // ------------------------------------------------------------ asking

  /**
   * Adds the question and an empty answer, then fills the answer in as it streams.
   * The question and answer appear at once; the promise resolves when the answer has
   * finished, failed or been stopped.
   */
  async ask(
    conversationId: string,
    question: string,
    documentIds: string[] | null,
    documentsSearched: number,
  ): Promise<AskOutcome> {
    if (this.isAnswering(conversationId)) {
      return 'refused';
    }
    const answerKey = this.key();
    const answer: AnswerItem = {
      kind: 'answer',
      key: answerKey,
      messageId: null,
      phase: 'searching',
      text: '',
      citations: [],
      notFound: false,
      feedback: null,
      passagesFound: null,
      documentsSearched,
      question,
      documentIds,
      error: null,
    };
    const thread = this.thread(conversationId) ?? { status: 'ready' as const, items: [] };
    this.setThread(conversationId, {
      ...thread,
      items: [...thread.items, { kind: 'question', key: this.key(), text: question }, answer],
    });
    this.conversations.noteQuestion(conversationId, question);

    const controller = new AbortController();
    this.running.set(conversationId, controller);
    const update = (change: Partial<AnswerItem>) =>
      this.updateAnswer(conversationId, answerKey, change);

    try {
      await this.stream.ask(
        conversationId,
        { question, ...(documentIds ? { documentIds } : {}) },
        {
          searched: (event) => update({ phase: 'reading', passagesFound: event.passages }),
          token: (event) =>
            this.updateAnswer(conversationId, answerKey, (current) => ({
              phase: 'writing',
              text: current.text + event.text,
            })),
          citations: (event) =>
            update({
              phase: 'done',
              messageId: event.messageId,
              notFound: event.notFound,
              citations: event.citations,
            }),
          error: () => update({ phase: 'error', error: AI_UNREACHABLE }),
        },
        controller.signal,
      );
      return 'started';
    } catch (error) {
      if (controller.signal.aborted) {
        update({ phase: 'stopped' });
        return 'started';
      }
      return this.handleRefused(conversationId, answerKey, error);
    } finally {
      this.running.delete(conversationId);
      // "Questions today" in the sidebar.
      void this.auth.refreshUser();
    }
  }

  /** Stop: closes the connection, which also stops the AI on the backend. */
  stop(conversationId: string): void {
    this.running.get(conversationId)?.abort();
  }

  /**
   * Try again after an error. The backend already removed the unanswered
   * question, so the failed pair is removed here too and asked afresh.
   */
  async retry(conversationId: string, answer: AnswerItem): Promise<AskOutcome> {
    this.removePair(conversationId, answer.key);
    return this.ask(
      conversationId,
      answer.question,
      answer.documentIds,
      answer.documentsSearched ?? 0,
    );
  }

  async rate(answer: AnswerItem, conversationId: string, rating: FeedbackRating): Promise<void> {
    if (!answer.messageId || answer.feedback === rating) {
      return;
    }
    const previous = answer.feedback;
    this.updateAnswer(conversationId, answer.key, { feedback: rating });
    try {
      await firstValueFrom(
        this.http.post<void>(`${API}/messages/${answer.messageId}/feedback`, { rating }),
      );
    } catch {
      this.updateAnswer(conversationId, answer.key, { feedback: previous });
    }
  }

  // ------------------------------------------------------------ internals

  private handleRefused(conversationId: string, answerKey: string, error: unknown): AskOutcome {
    const status = error instanceof AskRefusedError ? error.status : 0;
    const message = error instanceof Error ? error.message : '';

    if (status === 401) {
      this.removePair(conversationId, answerKey);
      this.auth.endSession();
      void this.router.navigate(['/login'], {
        queryParams: { returnUrl: this.router.url, expired: true },
      });
      return 'refused';
    }
    if (status === 429) {
      // Nothing was saved; the page shows the "That's all for today" card instead.
      this.removePair(conversationId, answerKey);
      return 'limit-reached';
    }
    if (status === 0) {
      this.updateAnswer(conversationId, answerKey, {
        phase: 'error',
        error: { title: "Couldn't reach DocuMind.", detail: message },
      });
      return 'refused';
    }
    this.updateAnswer(conversationId, answerKey, {
      phase: 'error',
      error:
        status >= 500
          ? AI_UNREACHABLE
          : { title: "That question couldn't be asked.", detail: message },
    });
    return 'refused';
  }

  private fromMessage(message: MessageResponse): ThreadItem {
    if (message.role === 'USER') {
      return { kind: 'question', key: message.id, text: message.content };
    }
    return {
      kind: 'answer',
      key: message.id,
      messageId: message.id,
      phase: 'done',
      text: message.content,
      citations: message.citations,
      notFound: message.notFound,
      feedback: message.feedback,
      passagesFound: null,
      documentsSearched: null,
      question: '',
      documentIds: null,
      error: null,
    };
  }

  private updateAnswer(
    conversationId: string,
    answerKey: string,
    change: Partial<AnswerItem> | ((current: AnswerItem) => Partial<AnswerItem>),
  ): void {
    const thread = this.thread(conversationId);
    if (!thread) {
      return;
    }
    this.setThread(conversationId, {
      ...thread,
      items: thread.items.map((item) =>
        item.kind === 'answer' && item.key === answerKey
          ? { ...item, ...(typeof change === 'function' ? change(item) : change) }
          : item,
      ),
    });
  }

  /** Removes an answer and the question just before it. */
  private removePair(conversationId: string, answerKey: string): void {
    const thread = this.thread(conversationId);
    if (!thread) {
      return;
    }
    const index = thread.items.findIndex((item) => item.key === answerKey);
    if (index < 0) {
      return;
    }
    const start = thread.items[index - 1]?.kind === 'question' ? index - 1 : index;
    this.setThread(conversationId, {
      ...thread,
      items: thread.items.filter((_, i) => i < start || i > index),
    });
  }

  private setThread(conversationId: string, thread: Thread): void {
    this.threadMap.update((map) => ({ ...map, [conversationId]: thread }));
  }

  private reset(): void {
    this.running.forEach((controller) => controller.abort());
    this.running.clear();
    this.threadMap.set({});
    this.scopeMap.set({});
  }

  private key(): string {
    return `local-${++this.nextKey}`;
  }
}

export function isInProgress(phase: AnswerPhase): boolean {
  return phase === 'searching' || phase === 'reading' || phase === 'writing';
}
