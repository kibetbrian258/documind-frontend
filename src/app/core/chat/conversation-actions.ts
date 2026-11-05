import { inject, Service } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ConversationResponse } from '../api/api.models';
import { problemMessage } from '../http/problem';
import { ConfirmDialog, ConfirmDialogData } from '../../shared/confirm-dialog';
import { RenameDialog, RenameDialogData } from '../../shared/rename-dialog/rename-dialog';
import { ChatSession } from './chat-session';
import { ConversationsStore } from './conversations.store';

/** Rename and delete (US-9), shared by the chat header and the sidebar's ⋯ menu. */
@Service()
export class ConversationActions {
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly conversations = inject(ConversationsStore);
  private readonly session = inject(ChatSession);

  async rename(conversation: ConversationResponse): Promise<void> {
    const current = displayTitle(conversation);
    const dialog = this.dialog.open<RenameDialog, RenameDialogData, string>(RenameDialog, {
      width: '440px',
      data: { title: 'Rename chat', current: conversation.title ?? '', maxLength: 200 },
    });
    const title = await firstValueFrom(dialog.afterClosed());
    if (!title || title === current) {
      return;
    }
    try {
      await this.conversations.rename(conversation.id, title);
    } catch (error) {
      this.snackBar.open(problemMessage(error, "Couldn't rename the chat. Try again."), 'OK', {
        duration: 5000,
      });
    }
  }

  async delete(conversation: ConversationResponse): Promise<void> {
    const dialog = this.dialog.open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
      width: '440px',
      data: {
        title: 'Delete this chat?',
        message: `“${displayTitle(conversation)}” and all its answers will be removed. This can't be undone.`,
        confirmLabel: 'Delete',
      },
    });
    if (!(await firstValueFrom(dialog.afterClosed()))) {
      return;
    }
    try {
      this.session.stop(conversation.id);
      await this.conversations.delete(conversation.id);
      this.session.forget(conversation.id);
      if (this.conversations.activeId() === conversation.id) {
        await this.router.navigateByUrl('/chat');
      }
    } catch (error) {
      this.snackBar.open(problemMessage(error, "Couldn't delete the chat. Try again."), 'OK', {
        duration: 5000,
      });
    }
  }
}

export function displayTitle(conversation: ConversationResponse | null | undefined): string {
  return conversation?.title?.trim() || 'New chat';
}
