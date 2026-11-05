import { Component, inject, input, signal } from '@angular/core';
import {
  email,
  form,
  FormField,
  maxLength,
  minLength,
  required,
  submit,
} from '@angular/forms/signals';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { httpStatus, problemMessage } from '../../core/http/problem';
import { Logo } from '../../shared/logo/logo';

/**
 * Sign in and Create account (US-1), one page with two tabs.
 *
 * Forms use Angular's Signal Forms: the form's values live in a signal
 * (the "model"), and the rules (required, email...) are declared once.
 * The backend checks the same rules again; these are just quicker feedback.
 */
@Component({
  selector: 'app-auth-page',
  imports: [FormField, RouterLink, MatIconModule, Logo],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.css',
})
export class AuthPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** From the route's data: which tab is open. */
  readonly mode = input<'signin' | 'register'>('signin');
  /** From the query string: where to go after signing in, e.g. ?returnUrl=/library */
  readonly returnUrl = input<string>();
  /** From the query string: set when the previous session ran out. */
  readonly expired = input<string>();

  /** The message in the red box above the form, if any. */
  protected readonly serverError = signal<string | null>(null);

  // ------------------------------------------------------------ sign in

  protected readonly signInModel = signal({ email: '', password: '', rememberMe: true });

  protected readonly signInForm = form(this.signInModel, (field) => {
    required(field.email, { message: 'Enter your email.' });
    email(field.email, { message: 'Enter a valid email address.' });
    required(field.password, { message: 'Enter your password.' });
  });

  protected async signIn(event: Event): Promise<void> {
    event.preventDefault();
    this.serverError.set(null);
    await submit(this.signInForm, async () => {
      try {
        await this.auth.signIn(this.signInModel());
        await this.goOn();
      } catch (error) {
        this.serverError.set(
          httpStatus(error) === 401
            ? "That email and password don't match. Check them and try again."
            : problemMessage(error),
        );
      }
    });
  }

  // ------------------------------------------------------------ create account

  protected readonly registerModel = signal({ fullName: '', email: '', password: '' });

  protected readonly registerForm = form(this.registerModel, (field) => {
    required(field.fullName, { message: 'Enter your name.' });
    maxLength(field.fullName, 100, { message: 'Use 100 characters or fewer.' });
    required(field.email, { message: 'Enter your email.' });
    email(field.email, { message: 'Enter a valid email address.' });
    maxLength(field.email, 254, { message: 'That email is too long.' });
    required(field.password, { message: 'Choose a password.' });
    minLength(field.password, 8, { message: 'Use at least 8 characters.' });
    maxLength(field.password, 72, { message: 'Use 72 characters or fewer.' });
  });

  protected async register(event: Event): Promise<void> {
    event.preventDefault();
    this.serverError.set(null);
    await submit(this.registerForm, async () => {
      try {
        await this.auth.register(this.registerModel());
        await this.goOn();
      } catch (error) {
        this.serverError.set(problemMessage(error));
      }
    });
  }

  // ------------------------------------------------------------ shared

  /** Only allow going back to pages inside this app (never to another website). */
  private async goOn(): Promise<void> {
    const target = this.returnUrl();
    const safe = target && target.startsWith('/') && !target.startsWith('//') ? target : '/chat';
    await this.router.navigateByUrl(safe);
  }
}
