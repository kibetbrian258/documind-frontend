import { Component, input } from '@angular/core';

/**
 * The DocuMind mark (a page with a highlighted line) and, optionally, the name.
 *
 * tone="light": white tile, for dark backgrounds (sign-in hero, admin sidebar).
 * tone="dark":  navy tile, for light backgrounds (app sidebar).
 */
@Component({
  selector: 'app-logo',
  template: `
    <svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" [attr.fill]="tone() === 'dark' ? '#1c1e3e' : '#ffffff'" />
      <rect
        x="8"
        y="9"
        width="16"
        height="3"
        rx="1.5"
        [attr.fill]="tone() === 'dark' ? '#ffffff' : '#1c1e3e'"
      />
      <rect x="8" y="14.5" width="16" height="4" rx="1.5" fill="#ffd84d" />
      <rect
        x="8"
        y="21"
        width="10"
        height="2.5"
        rx="1.25"
        [attr.fill]="tone() === 'dark' ? '#8a8c9b' : '#cfccc1'"
      />
    </svg>
    @if (showName()) {
      <span class="name">DocuMind</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }

    .mark {
      width: 30px;
      height: 30px;
      flex-shrink: 0;
    }

    .name {
      font-family: var(--dm-font-display);
      font-size: 21px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
  `,
})
export class Logo {
  readonly tone = input<'light' | 'dark'>('dark');
  readonly showName = input(true);
}
