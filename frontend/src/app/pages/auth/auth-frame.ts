import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Brand } from '../../layout/brand';
import { EcgLine } from '../../layout/ecg-line';
import { ThemeToggle } from '../../shared/components/theme-toggle';

/** Marco de las pantallas públicas: monitor con traza ECG de fondo y panel central. */
@Component({
  selector: 'app-auth-frame',
  imports: [Brand, EcgLine, ThemeToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative flex min-h-dvh flex-col overflow-hidden">
      <app-ecg-line class="pointer-events-none absolute inset-x-0 top-[38%] h-40 opacity-25" [beats]="5" [speed]="3.2" />
      <header class="relative z-10 flex items-center justify-between px-4 py-4 sm:px-8">
        <app-brand subtitle="Sistema de gestión cardiológica" />
        <app-theme-toggle />
      </header>
      <main id="contenido" tabindex="-1" class="relative z-10 flex flex-1 items-center justify-center px-4 py-8 outline-none">
        <div class="w-full stagger-in" [class]="wide() ? 'max-w-3xl' : 'max-w-md'">
          <ng-content />
        </div>
      </main>
      <footer class="relative z-10 px-4 pb-4 text-center font-mono text-[10px] tracking-widest text-muted uppercase">
        HeartGuard · la predicción de la IA no sustituye el criterio médico
      </footer>
    </div>
  `,
})
export class AuthFrame {
  readonly wide = input(false);
}
