import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Service, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API, ConversationResponse } from '../api/api.models';
import { AuthService } from '../auth/auth.service';

/** Same rule as Conversation.titleFromFirstQuestion on the backend. */
const MAX_TITLE_LENGTH = 80;

export interface ConversationGroup {
  label: string;
  conversations: ConversationResponse[];
}

/**
 * The signed-in user's conversations, for the sidebar list and the chat header (US-9).
 * Loads when someone signs in and is cleared when they sign out.
 */
@Service()
export class ConversationsStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly list = signal<ConversationResponse[]>([]);
  private readonly loadState = signal<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  private readonly active = signal<string | null>(null);

  /** Most recently used first. */
  readonly conversations = this.list.asReadonly();
  readonly status = this.loadState.asReadonly();

  /** The conversation open on screen (set by the chat page), for the sidebar and the phone header. */
  readonly activeId = this.active.asReadonly();
  readonly activeConversation = computed(() => {
    const id = this.active();
    return id ? (this.list().find((c) => c.id === id) ?? null) : null;
  });

  /** Today / This week / Earlier, as in the sidebar design. */
  readonly groups = computed<ConversationGroup[]>(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 6);

    const today: ConversationResponse[] = [];
    const thisWeek: ConversationResponse[] = [];
    const earlier: ConversationResponse[] = [];
    for (const conversation of this.list()) {
      const used = new Date(conversation.updatedAt);
      (used >= startOfToday ? today : used >= startOfWeek ? thisWeek : earlier).push(conversation);
    }
    return [
      { label: 'Today', conversations: today },
      { label: 'This week', conversations: thisWeek },
      { label: 'Earlier', conversations: earlier },
    ].filter((group) => group.conversations.length > 0);
  });

  constructor() {
    effect(() => {
      const signedIn = this.auth.isSignedIn();
      untracked(() => {
        if (signedIn) {
          void this.load();
        } else {
          this.list.set([]);
          this.loadState.set('idle');
          this.active.set(null);
        }
      });
    });
  }

  async load(): Promise<void> {
    if (this.list().length === 0) {
      this.loadState.set('loading');
    }
    try {
      this.list.set(
        await firstValueFrom(this.http.get<ConversationResponse[]>(`${API}/conversations`)),
      );
      this.loadState.set('loaded');
    } catch {
      if (this.list().length === 0) {
        this.loadState.set('error');
      }
    }
  }

  setActive(id: string | null): void {
    this.active.set(id);
  }

  async create(): Promise<ConversationResponse> {
    const conversation = await firstValueFrom(
      this.http.post<ConversationResponse>(`${API}/conversations`, {}),
    );
    this.list.update((list) => [conversation, ...list.filter((c) => c.id !== conversation.id)]);
    return conversation;
  }

  async rename(id: string, title: string): Promise<void> {
    const renamed = await firstValueFrom(
      this.http.patch<ConversationResponse>(`${API}/conversations/${id}`, { title }),
    );
    this.replace(renamed);
  }

  async delete(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${API}/conversations/${id}`));
    this.list.update((list) => list.filter((c) => c.id !== id));
  }

  /**
   * After asking: the backend names an untitled conversation after its first
   * question and moves it to the top. Do the same here, so the sidebar updates at once.
   */
  noteQuestion(id: string, question: string): void {
    const conversation = this.list().find((c) => c.id === id);
    if (!conversation) {
      return;
    }
    this.replace({
      ...conversation,
      title: conversation.title?.trim() ? conversation.title : titleFrom(question),
      updatedAt: new Date().toISOString(),
    });
  }

  private replace(conversation: ConversationResponse): void {
    // Most recently used first, like the backend's list.
    this.list.update((list) =>
      [conversation, ...list.filter((c) => c.id !== conversation.id)].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    );
  }
}

function titleFrom(question: string): string {
  const oneLine = question.trim().replace(/\s+/g, ' ');
  return oneLine.length <= MAX_TITLE_LENGTH
    ? oneLine
    : oneLine.slice(0, MAX_TITLE_LENGTH - 1).trim() + '…';
}
