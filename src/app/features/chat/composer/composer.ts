import { A11yModule } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { DocumentScope } from '../../../core/chat/chat-session';
import { effectiveScope, scopeLabel } from '../../../core/chat/document-scope';
import { DocumentsStore } from '../../../core/documents/document.store';
import { DocumentPicker } from '../document-picker/document-picker';

/** Same limit as AskRequest on the backend. */
export const MAX_QUESTION_LENGTH = 2000;

const BELOW: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -8 },
];
const ABOVE: ConnectedPosition[] = [BELOW[1], BELOW[0]];

/**
 * The question box: text, the "Searching 3 of 9 ready documents" chip that
 * opens the document picker, Send, and Stop while an answer is being written.
 *
 * Enter sends; Shift+Enter starts a new line.
 */
@Component({
  selector: 'app-composer',
  imports: [MatIconModule, CdkOverlayOrigin, CdkConnectedOverlay, A11yModule, DocumentPicker],
  templateUrl: './composer.html',
  styleUrl: './composer.css',
})
export class Composer {
  private readonly documents = inject(DocumentsStore);

  /** 'home': the big box on the new-chat screen, picker opens below. 'thread': docked at the bottom, opens above. */
  readonly variant = input<'home' | 'thread'>('thread');
  readonly placeholder = input('Ask about your documents');
  /** When set, asking is not possible and this text replaces the placeholder. */
  readonly blockedReason = input<string | null>(null);
  readonly answering = input(false);
  readonly busy = input(false);

  readonly text = model('');
  readonly scope = model<DocumentScope>(null);

  readonly send = output<string>();
  readonly stop = output<void>();

  protected readonly maxLength = MAX_QUESTION_LENGTH;
  protected readonly pickerOpen = signal(false);
  protected readonly overlayWidth = signal(0);
  protected readonly positions = computed(() => (this.variant() === 'home' ? BELOW : ABOVE));

  private readonly input = viewChild.required<ElementRef<HTMLTextAreaElement>>('input');
  private readonly card = viewChild.required<ElementRef<HTMLElement>>('card');
  private readonly chip = viewChild.required<ElementRef<HTMLElement>>('chip');

  private readonly readyIds = computed(() => this.documents.readyDocuments().map((d) => d.id));
  protected readonly scopeText = computed(() =>
    scopeLabel(effectiveScope(this.scope(), this.readyIds()), this.readyIds().length),
  );
  protected readonly nothingSelected = computed(() => {
    const scope = effectiveScope(this.scope(), this.readyIds());
    return this.readyIds().length === 0 || (scope !== null && scope.length === 0);
  });

  protected readonly length = computed(() => this.text().length);
  protected readonly canSend = computed(
    () =>
      this.text().trim().length > 0 &&
      this.length() <= MAX_QUESTION_LENGTH &&
      !this.answering() &&
      !this.busy() &&
      !this.blockedReason() &&
      !this.nothingSelected(),
  );

  constructor() {
    // Show the text when it is set from outside (cleared after sending, a suggestion, a
    // restored question), then grow the box to fit it, up to a limit. Comparing with the
    // box itself, rather than using [value], also works when typing and clearing happen
    // in the same moment (pasting and pressing Enter at once).
    afterRenderEffect(() => {
      const text = this.text();
      const area = this.input().nativeElement;
      if (area.value !== text) {
        area.value = text;
      }
      area.style.height = 'auto';
      area.style.height = `${Math.min(area.scrollHeight, 220)}px`;
    });
  }

  focus(): void {
    const area = this.input().nativeElement;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
  }

  protected onEnter(event: Event): void {
    const key = event as KeyboardEvent;
    if (key.shiftKey || key.isComposing) {
      return; // new line, or still typing with an input method
    }
    event.preventDefault();
    this.submit();
  }

  protected submit(): void {
    if (this.canSend()) {
      this.pickerOpen.set(false);
      this.send.emit(this.text().trim());
    }
  }

  protected togglePicker(): void {
    this.overlayWidth.set(this.card().nativeElement.getBoundingClientRect().width);
    this.pickerOpen.update((open) => !open);
  }

  protected onOutsideClick(event: MouseEvent): void {
    // The chip toggles the picker itself; ignore its clicks here.
    if (!this.chip().nativeElement.contains(event.target as Node)) {
      this.pickerOpen.set(false);
    }
  }
}
