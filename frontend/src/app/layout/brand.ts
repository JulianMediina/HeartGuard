import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';

/** Logotipo HeartGuard: corazón con latido y traza. */
@Component({
  selector: 'app-brand',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-2.5' },
  template: `
    <span class="relative grid size-9 place-items-center rounded-md border border-border-strong bg-surface-2">
      <svg viewBox="0 0 24 24" class="animate-heartbeat size-5 text-hg-alert" fill="currentColor" aria-hidden="true">
        <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z" />
      </svg>
    </span>
    <span class="leading-none">
      <span class="block text-lg font-bold tracking-[0.08em] text-fg">HEART<span class="text-hg-sage">GUARD</span></span>
      @if (subtitle()) {
        <span class="channel-label mt-1 block !text-[9px]">{{ subtitle() }}</span>
      }
    </span>
  `,
})
export class Brand {
  readonly subtitle = input('');
}

/** Reloj del monitor (HH:MM:SS). */
@Component({
  selector: 'app-live-clock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<time class="vital text-sm text-fg" [attr.datetime]="iso()">{{ text() }}</time>`,
})
export class LiveClock {
  protected readonly text = signal('');
  protected readonly iso = signal('');

  constructor() {
    const tick = () => {
      const d = new Date();
      this.text.set(d.toLocaleTimeString('es-CO', { hour12: false }));
      this.iso.set(d.toISOString());
    };
    tick();
    const id = setInterval(tick, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }
}
