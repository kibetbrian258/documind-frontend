import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import { AdminUserResponse } from '../../../core/api/api.models';
import { AdminUsersStore } from '../../../features/admin/admin-users.store';
import { problemMessage } from '../../../core/http/problem';

const MAX_LIMIT = 1000;

/**
 * "Edit limit": how many questions a user may ask per day (FR-15).
 * Saves itself and closes with the updated user, or undefined if cancelled.
 */
@Component({
  selector: 'app-limit-dialog',
  imports: [MatDialogModule],
  template: `
    <form (submit)="save($event)">
      <h2 mat-dialog-title>Daily question limit</h2>
      <mat-dialog-content>
        <p class="who">{{ user.fullName || user.email }}</p>
        <label class="dm-field">
          <span class="dm-label">Questions per day</span>
          <input
            class="dm-input"
            [class.is-invalid]="invalid()"
            type="number"
            inputmode="numeric"
            min="0"
            [max]="max"
            step="1"
            cdkFocusInitial
            [value]="value()"
            (input)="value.set($any($event.target).value)"
          />
          @if (invalid()) {
            <span class="dm-field-error">Enter a whole number from 0 to {{ max }}.</span>
          } @else {
            <span class="dm-hint">
              Used today: {{ user.questionsToday }}. 0 pauses asking. Takes effect on their next
              question.
            </span>
          }
        </label>
        @if (error()) {
          <div class="dm-alert dm-alert--error error" role="alert">{{ error() }}</div>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button type="button" class="dm-btn dm-btn--ghost" mat-dialog-close>Cancel</button>
        <button type="submit" class="dm-btn dm-btn--primary" [disabled]="invalid() || saving()">
          {{ saving() ? 'Saving…' : 'Save' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      display: grid;
      gap: 14px;
    }

    .who {
      color: var(--dm-text-muted);
    }

    mat-dialog-actions {
      gap: 8px;
      padding: 8px 24px 20px;
    }
  `,
})
export class LimitDialog {
  protected readonly user = inject<AdminUserResponse>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<LimitDialog, AdminUserResponse>>(MatDialogRef);
  private readonly store = inject(AdminUsersStore);

  protected readonly max = MAX_LIMIT;
  protected readonly value = signal(String(this.user.dailyLimit));
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly number = computed(() => Number(this.value()));
  protected readonly invalid = computed(() => {
    const n = this.number();
    return this.value().trim() === '' || !Number.isInteger(n) || n < 0 || n > MAX_LIMIT;
  });

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.invalid() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      this.dialogRef.close(await this.store.updateDailyLimit(this.user.id, this.number()));
    } catch (error) {
      this.error.set(problemMessage(error, "The limit couldn't be saved. Try again."));
      this.saving.set(false);
    }
  }
}
