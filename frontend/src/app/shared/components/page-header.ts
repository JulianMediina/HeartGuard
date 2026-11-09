import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Cabecera de pantalla: canal (código), título, subtítulo y acciones proyectadas. */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <header class="stagger-in mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        <p class="channel-label flex items-center gap-2">
          <span class="inline-block size-1.5 rounded-full bg-hg-sage shadow-[0_0_8px_var(--color-hg-sage)]" aria-hidden="true"></span>
          {{ channel() }}
        </p>
        <h1 class="mt-1 text-2xl leading-tight font-bold tracking-wide text-fg sm:text-3xl">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="mt-1 max-w-2xl text-sm text-muted">{{ subtitle() }}</p>
        }
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <ng-content />
      </div>
    </header>
  `,
})
export class PageHeader {
  readonly channel = input('');
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
