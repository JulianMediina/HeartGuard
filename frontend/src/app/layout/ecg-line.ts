import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

let uid = 0;

/**
 * Traza de ECG decorativa con barrido continuo y brillo de fósforo (motivo visual
 * de toda la app). `beats` latidos por traza; `color` cualquier color CSS.
 */
@Component({
  selector: 'app-ecg-line',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block pointer-events-none', 'aria-hidden': 'true' },
  template: `
    <svg [attr.viewBox]="'0 0 ' + width() + ' 40'" preserveAspectRatio="none" class="block h-full w-full overflow-visible">
      <defs>
        <linearGradient [attr.id]="gid" x1="0" x2="1">
          <stop offset="0%" [attr.stop-color]="color()" stop-opacity="0" />
          <stop offset="85%" [attr.stop-color]="color()" stop-opacity="1" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="1" />
        </linearGradient>
      </defs>
      <path [attr.d]="path()" fill="none" [attr.stroke]="color()" stroke-opacity="0.18" stroke-width="1.2" vector-effect="non-scaling-stroke" />
      <path
        [attr.d]="path()"
        fill="none"
        [attr.stroke]="color()"
        stroke-width="2"
        stroke-linejoin="round"
        stroke-linecap="round"
        pathLength="1"
        stroke-dasharray="0.3 0.7"
        vector-effect="non-scaling-stroke"
        class="animate-ecg glow"
        [style.--glow]="color()"
        [style.animation-duration.s]="speed()"
      />
    </svg>
  `,
})
export class EcgLine {
  readonly beats = input(3);
  readonly color = input('var(--app-trace)');
  /** Segundos por barrido completo. */
  readonly speed = input(2.6);
  protected readonly gid = `ecg-grad-${uid++}`;
  protected readonly width = computed(() => this.beats() * 200);

  /** Latido: onda P, complejo QRS y onda T sobre la línea base. */
  protected readonly path = computed(() =>
    Array.from({ length: this.beats() }, (_, i) => i * 200)
      .map(
        (o) =>
          `M${o},24 L${o + 60},24 Q${o + 70},16 ${o + 80},24 L${o + 92},24 L${o + 98},30 L${o + 106},2 L${o + 114},38 L${o + 120},24 ` +
          `L${o + 135},24 Q${o + 152},12 ${o + 168},24 L${o + 200},24`,
      )
      .join(' '),
  );
}
