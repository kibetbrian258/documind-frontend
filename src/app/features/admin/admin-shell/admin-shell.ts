import { Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { ReturnUrl } from '../../../core/navigation/return-url';
import { Logo } from '../../../shared/logo/logo';

/**
 * The admin area's frame: dark sidebar (Usage & cost, Evals, Users) and the page.
 * On phones the sidebar becomes a bar across the top.
 */
@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, Logo],
  templateUrl: './admin-shell.html',
  styleUrl: './admin-shell.css',
})
export class AdminShell {
  private readonly auth = inject(AuthService);

  private readonly router = inject(Router);
  private readonly returnUrl = inject(ReturnUrl);

  /** The chat or Library page you came from (as a UrlTree, so ?query parts survive). */
  protected readonly backUrl = computed(() => this.router.parseUrl(this.returnUrl.url()));

  protected readonly name = computed(() => {
    const user = this.auth.user();
    return user?.fullName?.trim() || user?.email || '';
  });

  protected readonly initials = computed(() => {
    const parts = this.name()
      .split(/[\s@._-]+/)
      .filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  });
}
