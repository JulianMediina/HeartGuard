import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Escala secuencial "flare" (claro → oscuro), igual que la paleta de seaborn del script original. */
const FLARE_SEQ = [
  '#fdf4ec',
  '#f8dfc9',
  '#edb081',
  '#e98d6b',
  '#e3685c',
  '#d14a61',
  '#b13c6c',
  '#8f3371',
  '#6c2b6d',
];

function hexToRgb(h: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function flareColor(t: number): string {
  const x = Math.min(1, Math.max(0, t)) * (FLARE_SEQ.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = hexToRgb(FLARE_SEQ[i]);
  const b = hexToRgb(FLARE_SEQ[Math.min(i + 1, FLARE_SEQ.length - 1)]);
  const mix = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return '#' + mix.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Texto blanco o casi negro según el contraste con el fondo de la celda. */
export function inkFor(bg: string): string {
  const L = luminance(hexToRgb(bg));
  const onWhite = 1.05 / (L + 0.05);
  const onDark = (L + 0.05) / (luminance(hexToRgb('#241027')) + 0.05);
  return onWhite >= onDark ? '#ffffff' : '#241027';
}

interface Cell {
  key: string;
  label: string;
  value: number;
  pct: number;
  bg: string;
  ink: string;
  i: number;
}

/** Matriz de confusión 2×2 como mapa de calor con la paleta flare. */
@Component({
  selector: 'app-confusion-matrix',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure>
      <div
        class="grid grid-cols-[3.75rem_1fr_1fr] gap-1.5 text-xs sm:grid-cols-[5rem_1fr_1fr] sm:text-sm"
        role="table"
        aria-label="Matriz de confusión del conjunto de test"
      >
        <div role="row" class="contents">
          <span role="columnheader"><span class="sr-only">Clase real</span></span>
          <span role="columnheader" class="pb-1 text-center font-medium text-muted"
            >Predicho: sin enfermedad</span
          >
          <span role="columnheader" class="pb-1 text-center font-medium text-muted"
            >Predicho: con enfermedad</span
          >
        </div>
        @for (row of rows(); track row.label; let r = $index) {
          <div role="row" class="contents">
            <span
              role="rowheader"
              class="flex items-center justify-end pr-1 text-right font-medium leading-tight text-muted"
            >
              {{ row.label }}
            </span>
            @for (c of row.cells; track c.key) {
              <div
                role="cell"
                class="stagger-in flex aspect-[4/3] flex-col items-center justify-center rounded-md p-2 text-center transition-transform duration-200 hover:scale-[1.02]"
                [style.--i]="c.i"
                [style.background]="c.bg"
                [style.color]="c.ink"
                [attr.title]="c.label + ': ' + c.value"
              >
                <span class="font-mono text-2xl font-bold tabular-nums sm:text-3xl">{{ c.value }}</span>
                <span
                  class="text-[11px] font-semibold uppercase tracking-wide opacity-90 sm:text-xs"
                  >{{ c.label }}</span
                >
                <span class="text-[11px] opacity-85 tabular-nums">{{ c.pct }}% de la fila</span>
              </div>
            }
          </div>
        }
      </div>
      <figcaption class="mt-3 flex items-center gap-2 text-xs text-muted">
        <span>Menos</span>
        <span
          class="h-2 flex-1 rounded-full"
          [style.background]="legendGradient"
          aria-hidden="true"
        ></span>
        <span>Más casos</span>
      </figcaption>
    </figure>
  `,
})
export class ConfusionMatrix {
  /** [[tn, fp], [fn, tp]] */
  readonly matrix = input.required<[[number, number], [number, number]]>();

  protected readonly legendGradient = `linear-gradient(90deg, ${FLARE_SEQ.join(', ')})`;

  protected readonly rows = computed(() => {
    const m = this.matrix();
    const max = Math.max(...m.flat(), 1);
    const names = [
      ['Verdaderos negativos', 'Falsos positivos'],
      ['Falsos negativos', 'Verdaderos positivos'],
    ];
    const rowLabels = ['Real: sin enfermedad', 'Real: con enfermedad'];
    return m.map((row, r) => {
      const total = row[0] + row[1] || 1;
      return {
        label: rowLabels[r],
        cells: row.map<Cell>((value, c) => {
          const bg = flareColor(0.08 + 0.92 * (value / max));
          return {
            key: `${r}-${c}`,
            label: names[r][c],
            value,
            pct: Math.round((value / total) * 100),
            bg,
            ink: inkFor(bg),
            i: r * 2 + c,
          };
        }),
      };
    });
  });
}
