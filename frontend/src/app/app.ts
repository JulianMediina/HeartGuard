import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ToastOutlet } from './shared/components/toast-outlet';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      href="#contenido"
      class="sr-only z-[70] rounded-md bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >Saltar al contenido</a
    >
    <router-outlet />
    <app-toast-outlet />
  `,
})
export class App {}
