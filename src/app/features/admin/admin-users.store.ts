import { HttpClient } from '@angular/common/http';
import { inject, Service, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AdminUserResponse, API } from '../../core/api/api.models';
import { AuthService } from '../../core/auth/auth.service';

/**
 * All users with their daily limits, for the admin pages. Shared, so a limit
 * changed on "Usage & cost" also shows on "Users" without reloading.
 */
@Service()
export class AdminUsersStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly list = signal<AdminUserResponse[]>([]);
  private readonly loadState = signal<'idle' | 'loading' | 'loaded' | 'error'>('idle');

  /** Newest accounts first. */
  readonly users = this.list.asReadonly();
  readonly status = this.loadState.asReadonly();

  async load(): Promise<void> {
    if (this.list().length === 0) {
      this.loadState.set('loading');
    }
    try {
      this.list.set(await firstValueFrom(this.http.get<AdminUserResponse[]>(`${API}/admin/users`)));
      this.loadState.set('loaded');
    } catch {
      if (this.list().length === 0) {
        this.loadState.set('error');
      }
    }
  }

  /** Throws if the backend refuses (e.g. an invalid number). */
  async updateDailyLimit(userId: string, dailyLimit: number): Promise<AdminUserResponse> {
    const updated = await firstValueFrom(
      this.http.patch<AdminUserResponse>(`${API}/admin/users/${userId}/daily-limit`, {
        dailyLimit,
      }),
    );
    this.list.update((users) => users.map((u) => (u.id === updated.id ? updated : u)));
    if (updated.id === this.auth.user()?.id) {
      void this.auth.refreshUser(); // your own limit: update "Questions today" in the app too
    }
    return updated;
  }

  find(userId: string): AdminUserResponse | undefined {
    return this.list().find((u) => u.id === userId);
  }
}
