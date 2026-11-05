import { Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { AdminUserResponse } from '../../../core/api/api.models';
import { AdminUsersStore } from '../admin-users.store';
import { count, initials, shortDay } from '../admin-format';
import { LimitDialog } from '../limit-dialog/limit-dialog';

/** Users (US-11, FR-15): everyone's daily limit and today's use, with "Edit limit". */
@Component({
  selector: 'app-users-page',
  imports: [MatIconModule],
  templateUrl: './users-page.html',
  styleUrls: ['../admin-common.css', './users-page.css'],
})
export class UsersPage {
  private readonly dialog = inject(MatDialog);
  protected readonly store = inject(AdminUsersStore);

  protected readonly query = signal('');
  protected readonly count = count;
  protected readonly initials = initials;
  protected readonly shortDay = shortDay;

  protected readonly visible = computed(() => {
    const query = this.query().trim().toLowerCase();
    const users = this.store.users();
    return query
      ? users.filter(
          (u) => u.email.includes(query) || (u.fullName ?? '').toLowerCase().includes(query),
        )
      : users;
  });

  constructor() {
    void this.store.load();
  }

  protected usedPercent(user: AdminUserResponse): number {
    return user.dailyLimit > 0 ? Math.min(100, (100 * user.questionsToday) / user.dailyLimit) : 100;
  }

  protected editLimit(user: AdminUserResponse): void {
    this.dialog.open(LimitDialog, { width: '420px', data: user });
  }
}
