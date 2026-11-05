import { HttpClient } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { API, LoginRequest, RegisterRequest, UserResponse } from '../api/api.models';
import { httpStatus } from '../http/problem';

/**
 * Who is signed in, shared by the whole app.
 *
 * The login itself lives in an HttpOnly cookie that JavaScript can't read, so
 * the app learns who is signed in by asking the backend (GET /me). The answer
 * is kept in the `user` signal; components read it and update automatically.
 */
@Service()
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly currentUser = signal<UserResponse | null>(null);

  /** The signed-in user, or null. */
  readonly user = this.currentUser.asReadonly();
  readonly isSignedIn = computed(() => this.currentUser() !== null);
  readonly isAdmin = computed(() => this.currentUser()?.role === 'ADMIN');

  /**
   * Runs once before the first page shows (see app.config.ts):
   * 1. gets the CSRF cookie, which every POST, PATCH and DELETE needs
   * 2. checks whether this browser is still signed in from an earlier visit
   */
  async initialize(): Promise<void> {
    try {
      await firstValueFrom(this.http.get<void>(`${API}/auth/csrf`));
    } catch {
      // Backend unreachable: pages show their own error when they load data.
    }
    await this.refreshUser();
  }

  /**
   * Reloads the user, e.g. to update "questions remaining today" after asking.
   *
   * Only a 401 means "not signed in". Any other failure (the backend is
   * restarting, the network dropped) keeps the current user, so a brief hiccup
   * doesn't sign you out on screen and empty your chats and Library.
   */
  async refreshUser(): Promise<UserResponse | null> {
    try {
      const user = await firstValueFrom(this.http.get<UserResponse>(`${API}/me`));
      this.currentUser.set(user);
      return user;
    } catch (error) {
      if (httpStatus(error) === 401) {
        this.currentUser.set(null);
      }
      return this.currentUser();
    }
  }

  async signIn(request: LoginRequest): Promise<UserResponse> {
    const user = await firstValueFrom(this.http.post<UserResponse>(`${API}/auth/login`, request));
    this.currentUser.set(user);
    return user;
  }

  async register(request: RegisterRequest): Promise<UserResponse> {
    const user = await firstValueFrom(
      this.http.post<UserResponse>(`${API}/auth/register`, request),
    );
    this.currentUser.set(user);
    return user;
  }

  async signOut(): Promise<void> {
    try {
      await firstValueFrom(this.http.post<void>(`${API}/auth/logout`, {}));
    } finally {
      this.endSession();
      await this.router.navigateByUrl('/login');
    }
  }

  /** Forgets the user locally, e.g. when the backend says the session has expired. */
  endSession(): void {
    this.currentUser.set(null);
  }
}
