import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

export interface BarDatum {
  label: string;
  value: number;
  /** Texto de la etiqueta del eje (más corto); por defecto `label`. */
  short?: string;
  color?: string;
}

/**
 * Barras verticales en SVG (sin dependencias): crecen al aparecer, valor encima,
 * foco por teclado y lectura accesible por barra.
 */
@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <figure>
      <div class="flex items-end gap-1.5 sm:gap-2" [style.height.px]="height()" role="list" [attr.aria-label]="ariaLabel()">
        @for (b of bars(); track b.label; let i = $index) {
          <div
            role="listitem"
            class="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none"
            tabindex="0"
            [attr.aria-label]="b.label + ': ' + b.value"
            (mouseenter)="hover.set(i)"
            (mouseleave)="hover.set(null)"
            (focus)="hover.set(i)"
            (blur)="hover.set(null)"
          >
            <span
              class="mb-1 font-mono text-[10px] tabular-nums transition-opacity sm:text-[11px]"
              [class]="hover() === i ? 'text-fg opacity-100' : 'text-muted ' + (showValues() ? 'opacity-100' : 'opacity-0')"
              >{{ b.value }}</span
            >
            <div
              class="bar w-full max-w-10 rounded-t-sm transition-[height,filter] duration-700 ease-out group-hover:brightness-125 group-focus:brightness-125"
              [style.height.%]="b.h"
              [style.background]="b.color"
              [style.animation-delay.ms]="i * 45"
              [style.box-shadow]="hover() === i ? '0 0 14px -2px ' + b.color : 'none'"
            ></div>
          </div>
        }
      </div>
      <div class="mt-1.5 flex gap-1.5 border-t border-border-strong/60 pt-1.5 sm:gap-2" aria-hidden="true">
        @for (b of bars(); track b.label) {
          <span class="min-w-0 flex-1 truncate text-center font-mono text-[9px] text-muted uppercase sm:text-[10px]">{{ b.short }}</span>
        }
      </div>
    </figure>
  `,
  styles: `
    .bar {
      transform-origin: bottom;
      animation: grow-y 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes grow-y {
      from {
        transform: scaleY(0);
      }
    }
  `,
})
export class BarChart {
  readonly data = input.required<BarDatum[]>();
  readonly height = input(180);
  readonly color = input('var(--app-series-1)');
  readonly ariaLabel = input('Gráfico de barras');
  readonly showValues = input(true);
  protected readonly hover = signal<number | null>(null);

  protected readonly bars = computed(() => {
    const d = this.data();
    const max = Math.max(1, ...d.map((x) => x.value));
    return d.map((x) => ({
      ...x,
      short: x.short ?? x.label,
      color: x.color ?? this.color(),
      h: Math.max(x.value ? 3 : 0.5, (x.value / max) * 86),
    }));
  });
}
