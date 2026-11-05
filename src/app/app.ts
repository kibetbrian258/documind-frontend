import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root component: just a place for the router to show the current page.
 * The toolbar and navigation live in layout/shell.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {}
