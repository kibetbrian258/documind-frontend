import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel: string;
}

/**
 * "Are you sure?" before something that can't be undone, like deleting a document.
 * Closes with true (confirmed) or false/undefined (cancelled, Esc, or click outside).
 *
 * Usage: this.dialog.open(ConfirmDialog, { data: { title, message, confirmLabel } })
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <!-- Focus starts on Cancel, so pressing Enter by accident doesn't delete anything. -->
      <button type="button" class="dm-btn dm-btn--ghost" [mat-dialog-close]="false" cdkFocusInitial>
        Cancel
      </button>
      <button type="button" class="dm-btn dm-btn--danger" [mat-dialog-close]="true">
        {{ data.confirmLabel }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content p {
      color: var(--dm-text-muted);
    }

    mat-dialog-actions {
      gap: 8px;
      padding: 8px 24px 20px;
    }
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
