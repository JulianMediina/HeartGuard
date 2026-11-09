import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ThemeService } from '../../core/services/theme.service';
import { Icon } from './icon';

@Component({
  selector: 'app-theme-toggle',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="grid size-9 place-items-center rounded-md border border-border text-muted transition hover:border-border-strong hover:text-fg"
      (click)="theme.toggle()"
      [attr.aria-label]="theme.theme() === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
      [attr.aria-pressed]="theme.theme() === 'dark'"
      title="Tema claro / oscuro"
    >
      <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
    </button>
  `,
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);
}
