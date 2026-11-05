import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';

import { AuthService } from '../../../core/auth/auth.service';

/**
 * "That's all 50 questions for today." (FR-15), with a countdown to midnight.
 * When the countdown ends it reloads the user, so asking unlocks by itself.
 */
@Component({
  selector: 'app-daily-limit',
  template: `
    <div class="limit" role="status">
      <span class="ring dm-mono" aria-hidden="true">{{ limit() }}</span>
      <div>
        <p class="title">That's all {{ limit() }} questions for today.</p>
        <p class="text">
          Your questions refill at midnight{{ countdown() ? ' — in ' + countdown() : '' }}. Your
          documents and past chats are still here to read.
        </p>
      </div>
    </div>
  `,
  styles: `
    .limit {
      display: flex;
      align-items: center;
      gap: 18px;
      padding: 20px 22px;
      border-radius: var(--dm-radius-lg);
      background: var(--dm-warning-bg);
    }

    .ring {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 60px;
      height: 60px;
      border: 7px solid var(--dm-navy);
      border-radius: 50%;
      font-size: 14px;
      font-weight: 600;
    }

    .title {
      margin-bottom: 4px;
      font-family: var(--dm-font-display);
      font-size: 17px;
      font-weight: 700;
    }

    .text {
      color: var(--dm-text-muted);
      font-size: 14px;
    }
  `,
})
export class DailyLimit {
  private readonly auth = inject(AuthService);

  readonly limit = input.required<number>();
  /** ISO time when the questions refill (UserResponse.questionsResetAt). */
  readonly resetsAt = input<string | null>(null);

  private readonly now = signal(Date.now());

  /** "5 h 12 min", "12 min", "less than a minute". */
  protected readonly countdown = computed(() => {
    const resetsAt = this.resetsAt();
    if (!resetsAt) {
      return '';
    }
    const minutes = Math.ceil((new Date(resetsAt).getTime() - this.now()) / 60_000);
    if (minutes <= 1) {
      return 'less than a minute';
    }
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    // Midnight has passed: fetch the fresh count, which hides this card.
    let refreshed = false;
    effect(() => {
      const resetsAt = this.resetsAt();
      if (resetsAt && this.now() >= new Date(resetsAt).getTime() && !refreshed) {
        refreshed = true;
        untracked(() => void this.auth.refreshUser());
      }
    });
  }
}
