import { inject, Service, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/**
 * Remembers where you were, so you're taken back there instead of to an empty
 * new chat:
 * - `url`: the last app page (a chat or the Library), for "Back to the app" on the admin pages
 * - `lastChat`: the last conversation you had open, for "Chats" in the sidebar
 * - `current`: the page shown now
 *
 * The app shell starts it; until then, or after a page reload straight into
 * the admin area, it points at /chat.
 */
@Service()
export class ReturnUrl {
  private readonly router = inject(Router);
  private readonly last = signal('/chat');
  private readonly lastConversation = signal<string | null>(null);
  private readonly now = signal('/');

  readonly url = this.last.asReadonly();
  /** e.g. "/chat/2b4b4886-…"; null until a conversation has been opened. */
  readonly lastChat = this.lastConversation.asReadonly();
  readonly current = this.now.asReadonly();

  constructor() {
    this.remember(this.router.url);
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.remember(event.urlAfterRedirects));
  }

  private remember(url: string): void {
    this.now.set(url);
    const isAppPage = url.startsWith('/chat') || url.startsWith('/library');
    if (isAppPage) {
      this.last.set(url);
    }
    if (url.startsWith('/chat/')) {
      this.lastConversation.set(url);
    }
  }
}
