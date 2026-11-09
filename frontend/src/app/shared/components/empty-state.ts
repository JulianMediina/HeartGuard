import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { EcgLine } from '../../layout/ecg-line';

/** Estado vacío: traza plana («sin señal») y mensaje. */
@Component({
  selector: 'app-empty-state',
  imports: [EcgLine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-col items-center px-4 py-10 text-center" role="status">
      <app-ecg-line class="h-8 w-48 opacity-40" [beats]="2" [speed]="5" />
      <p class="mt-3 font-semibold text-fg">{{ title() }}</p>
      @if (text()) {
        <p class="mt-1 max-w-md text-sm text-muted">{{ text() }}</p>
      }
      <div class="mt-4"><ng-content /></div>
    </div>
  `,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly text = input('');
}
