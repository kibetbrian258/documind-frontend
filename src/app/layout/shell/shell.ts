import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { ConversationActions, displayTitle } from '../../core/chat/conversation-actions';
import { ConversationsStore } from '../../core/chat/conversations.store';
import { DocumentsStore } from '../../core/documents/document.store';
import { ReturnUrl } from '../../core/navigation/return-url';
import { Logo } from '../../shared/logo/logo';

/**
 * The app frame: sidebar on the left, current page on the right.
 * On phones the sidebar slides in from the left when the menu button is pressed.
 * The sidebar lists the user's conversations, each with a ⋯ menu to rename or delete it.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, MatMenuModule, Logo],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly conversations = inject(ConversationsStore);
  protected readonly actions = inject(ConversationActions);
  protected readonly displayTitle = displayTitle;

  private readonly documents = inject(DocumentsStore);

  /** The count next to "Library"; hidden until the list has loaded. */
  protected readonly documentCount = computed(() =>
    this.documents.status() === 'loaded' ? this.documents.count() : null,
  );

  private readonly router = inject(Router);
  private readonly returnUrl = inject(ReturnUrl);

  /**
   * "Chats" goes back to the conversation you last had open (if it still
   * exists), not to an empty new chat. "New chat" is the button above it.
   */
  protected readonly chatsLink = computed(() => {
    const last = this.returnUrl.lastChat();
    const id = last?.split('/')[2]?.split('?')[0];
    const exists = id && this.conversations.conversations().some((c) => c.id === id);
    return this.router.parseUrl(exists ? last! : '/chat');
  });

  /** "Chats" is highlighted on every chat page, new or existing. */
  protected readonly onChatPage = computed(() => this.returnUrl.current().startsWith('/chat'));

  /** Phones: the top bar shows the open chat's name instead of the logo. */
  protected readonly activeTitle = computed(() => {
    const conversation = this.conversations.activeConversation();
    return conversation ? displayTitle(conversation) : null;
  });

  /** Phones only: is the sidebar open? */
  protected readonly navOpen = signal(false);

  protected readonly displayName = computed(() => {
    const user = this.auth.user();
    return user?.fullName?.trim() || user?.email || '';
  });

  protected readonly initials = computed(() => {
    const name = this.displayName();
    const parts = name.split(/[\s@._-]+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  });

  protected readonly questionsUsed = computed(() => {
    const user = this.auth.user();
    return user ? user.dailyLimit - user.questionsRemainingToday : 0;
  });

  protected readonly quotaPercent = computed(() => {
    const limit = this.auth.user()?.dailyLimit ?? 0;
    return limit > 0 ? Math.min(100, (100 * this.questionsUsed()) / limit) : 0;
  });

  constructor() {
    // Close the phone sidebar after choosing a page.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.navOpen.set(false));
  }

  protected toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  protected signOut(): void {
    void this.auth.signOut();
  }
}
