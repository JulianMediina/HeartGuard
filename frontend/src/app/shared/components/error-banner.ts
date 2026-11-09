import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Aviso de fallo (colores de alerta de HeartGuard) con botón de reintento. */
@Component({
  selector: 'app-error-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      role="alert"
      class="animate-fade-up flex flex-col gap-3 rounded-md border border-alert-border bg-alert-bg p-4 text-alert-fg sm:flex-row sm:items-center"
    >
      <span class="flex items-center gap-2">
        <span class="animate-blink inline-block size-2.5 rounded-full bg-hg-alert" aria-hidden="true"></span>
        <span class="font-mono text-[11px] font-bold tracking-[0.2em] uppercase">Sin señal</span>
      </span>
      <div class="flex-1">
        <p class="font-semibold">{{ title() }}</p>
        <p class="text-sm opacity-90">{{ message() }}</p>
      </div>
      <button
        type="button"
        class="btn self-start border border-alert-border text-alert-fg hover:bg-hg-alert/15 sm:self-auto"
        (click)="retry.emit()"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Reintentar
      </button>
    </div>
  `,
})
export class ErrorBanner {
  readonly title = input('No pudimos cargar los datos');
  readonly message = input.required<string>();
  readonly retry = output<void>();
}
