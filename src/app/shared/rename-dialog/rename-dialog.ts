import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface RenameDialogData {
  title: string;
  current: string;
  maxLength: number;
}

/**
 * Asks for a new name. Closes with the trimmed name, or undefined if cancelled.
 *
 * Usage: this.dialog.open(RenameDialog, { data: { title, current, maxLength } })
 */
@Component({
  selector: 'app-rename-dialog',
  imports: [MatDialogModule],
  template: `
    <form (submit)="save($event)">
      <h2 mat-dialog-title>{{ data.title }}</h2>
      <mat-dialog-content>
        <label class="dm-visually-hidden" for="rename-input">Name</label>
        <input
          id="rename-input"
          class="dm-input"
          cdkFocusInitial
          [value]="name()"
          [attr.maxlength]="data.maxLength"
          (input)="name.set($any($event.target).value)"
        />
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button type="button" class="dm-btn dm-btn--ghost" mat-dialog-close>Cancel</button>
        <button type="submit" class="dm-btn dm-btn--primary" [disabled]="!name().trim()">
          Save
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      padding-top: 4px;
    }

    mat-dialog-actions {
      gap: 8px;
      padding: 8px 24px 20px;
    }
  `,
})
export class RenameDialog {
  protected readonly data = inject<RenameDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<RenameDialog, string>>(MatDialogRef);

  protected readonly name = signal(this.data.current);

  protected save(event: Event): void {
    event.preventDefault();
    const name = this.name().trim();
    if (name) {
      this.dialogRef.close(name);
    }
  }
}
