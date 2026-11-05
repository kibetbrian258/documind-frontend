import { Routes } from '@angular/router';

import { adminGuard, signedInGuard, signedOutGuard } from './core/auth/auth.guards';
import { Shell } from './layout/shell/shell';

/**
 * Pages are loaded only when first visited (loadComponent), keeping the first download small.
 */
export const routes: Routes = [
  // Sign in and create account share one page with two tabs.
  {
    path: 'login',
    title: 'Sign in · DocuMind',
    canActivate: [signedOutGuard],
    data: { mode: 'signin' },
    loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPage),
  },
  {
    path: 'register',
    title: 'Create account · DocuMind',
    canActivate: [signedOutGuard],
    data: { mode: 'register' },
    loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPage),
  },

  // Admin has its own layout (dark sidebar), so it sits outside the app shell.
  {
    path: 'admin',
    canActivate: [signedInGuard, adminGuard],
    loadComponent: () =>
      import('./features/admin/admin-shell/admin-shell').then((m) => m.AdminShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'usage' },
      {
        path: 'usage',
        title: 'Usage & cost · DocuMind admin',
        loadComponent: () => import('./features/admin/usage/usage-page').then((m) => m.UsagePage),
      },
      {
        path: 'evals',
        title: 'Evals · DocuMind admin',
        loadComponent: () => import('./features/admin/evals/evals-page').then((m) => m.EvalsPage),
      },
      {
        path: 'users',
        title: 'Users · DocuMind admin',
        loadComponent: () => import('./features/admin/users/users-page').then((m) => m.UsersPage),
      },
    ],
  },

  // The app: sidebar + page.
  {
    path: '',
    component: Shell,
    canActivate: [signedInGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'chat' },
      {
        path: 'chat',
        title: 'Chat · DocuMind',
        loadComponent: () => import('./features/chat/chat-page').then((m) => m.ChatPage),
      },
      {
        // One conversation. The same page as above; ":id" arrives as the page's `id` input.
        path: 'chat/:id',
        title: 'Chat · DocuMind',
        loadComponent: () => import('./features/chat/chat-page').then((m) => m.ChatPage),
      },
      {
        path: 'library',
        title: 'Library · DocuMind',
        loadComponent: () => import('./features/library/library-page').then((m) => m.LibraryPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
