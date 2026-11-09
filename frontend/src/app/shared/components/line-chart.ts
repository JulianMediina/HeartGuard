import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

export interface ChartPoint {
  x: number;
  y: number;
}

export interface LineSeries {
  id: string;
  label: string;
  points: ChartPoint[];
  /** Color CSS (normalmente var(--app-series-N)). */
  color: string;
  dashed?: boolean;
  area?: boolean;
}

export interface ChartMarker {
  x: number;
  label: string;
}

const PAD = { top: 16, right: 16, bottom: 44, left: 52 };

/**
 * Gráfico de líneas en SVG (sin dependencias): ejes, rejilla tenue, trazo animado,
 * marcador vertical opcional, diagonal de referencia opcional y crosshair + tooltip
 * accesible con ratón y teclado (flechas).
 */
@Component({
  selector: 'app-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div #box class="relative w-full select-none">
      @if (series().length > 1) {
        <ul class="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted" aria-hidden="true">
          @for (s of series(); track s.id) {
            <li class="flex items-center gap-2">
              <svg width="22" height="8" class="overflow-visible">
                <line
                  x1="0"
                  y1="4"
                  x2="22"
                  y2="4"
                  [attr.stroke]="s.color"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  [attr.stroke-dasharray]="s.dashed ? '5 4' : null"
                />
              </svg>
              {{ s.label }}
            </li>
          }
        </ul>
      }
      <svg
        [attr.viewBox]="'0 0 ' + width() + ' ' + height()"
        [attr.width]="width()"
        [attr.height]="height()"
        class="block max-w-full overflow-visible outline-none"
        role="img"
        tabindex="0"
        [attr.aria-label]="ariaLabel()"
        (pointermove)="onPointer($event)"
        (pointerleave)="hover.set(null)"
        (keydown)="onKey($event)"
        (blur)="hover.set(null)"
      >
        <!-- Rejilla y ejes -->
        @for (t of yTicks(); track t.v) {
          <line
            [attr.x1]="pad.left"
            [attr.x2]="width() - pad.right"
            [attr.y1]="t.y"
            [attr.y2]="t.y"
            stroke="var(--app-chart-grid)"
            stroke-width="1"
          />
          <text
            [attr.x]="pad.left - 8"
            [attr.y]="t.y"
            dy="0.32em"
            text-anchor="end"
            class="fill-muted font-mono text-[10px] tabular-nums"
          >
            {{ t.label }}
          </text>
        }
        @for (t of xTicks(); track t.v) {
          <text
            [attr.x]="t.x"
            [attr.y]="height() - pad.bottom + 18"
            text-anchor="middle"
            class="fill-muted font-mono text-[10px] tabular-nums"
          >
            {{ t.label }}
          </text>
        }
        <line
          [attr.x1]="pad.left"
          [attr.x2]="width() - pad.right"
          [attr.y1]="height() - pad.bottom"
          [attr.y2]="height() - pad.bottom"
          stroke="var(--app-muted)"
          stroke-opacity="0.5"
        />
        <text
          [attr.x]="pad.left + plotW() / 2"
          [attr.y]="height() - 6"
          text-anchor="middle"
          class="fill-muted text-[11px] font-medium"
        >
          {{ xLabel() }}
        </text>
        <text
          [attr.transform]="'translate(12 ' + (pad.top + plotH() / 2) + ') rotate(-90)'"
          text-anchor="middle"
          class="fill-muted text-[11px] font-medium"
        >
          {{ yLabel() }}
        </text>

        @if (diagonal()) {
          <line
            [attr.x1]="sx(xDom()[0])"
            [attr.y1]="sy(yDom()[0])"
            [attr.x2]="sx(xDom()[1])"
            [attr.y2]="sy(yDom()[1])"
            stroke="var(--app-muted)"
            stroke-dasharray="4 4"
            stroke-opacity="0.7"
          />
        }

        @if (marker(); as m) {
          <g class="animate-fade-up" style="animation-delay: 900ms">
            <line
              [attr.x1]="sx(m.x)"
              [attr.x2]="sx(m.x)"
              [attr.y1]="pad.top"
              [attr.y2]="height() - pad.bottom"
              stroke="var(--app-fg)"
              stroke-opacity="0.7"
              stroke-dasharray="3 3"
            />
            <text
              [attr.x]="sx(m.x) + 6"
              [attr.y]="pad.top + 10"
              class="fill-fg text-[11px] font-semibold"
            >
              {{ m.label }}
            </text>
          </g>
        }

        @for (s of paths(); track s.id) {
          @if (s.area) {
            <path
              [attr.d]="s.areaD"
              [attr.fill]="s.color"
              fill-opacity="0.12"
              class="animate-fade-up"
            />
          }
          @if (s.dashed) {
            <path
              [attr.d]="s.d"
              fill="none"
              [attr.stroke]="s.color"
              stroke-width="2"
              stroke-dasharray="6 5"
              class="animate-fade-up glow"
              [style.--glow]="s.color"
            />
          } @else {
            <path
              [attr.d]="s.d"
              fill="none"
              [attr.stroke]="s.color"
              stroke-width="2"
              stroke-linejoin="round"
              stroke-linecap="round"
              pathLength="1"
              stroke-dasharray="1"
              class="animate-draw glow"
              [style.--glow]="s.color"
            />
          }
        }

        @if (hoverInfo(); as h) {
          <line
            [attr.x1]="h.px"
            [attr.x2]="h.px"
            [attr.y1]="pad.top"
            [attr.y2]="height() - pad.bottom"
            stroke="var(--app-muted)"
            stroke-opacity="0.6"
          />
          @for (r of h.rows; track r.id) {
            <circle
              [attr.cx]="h.px"
              [attr.cy]="r.py"
              r="4.5"
              [attr.fill]="r.color"
              stroke="var(--app-surface)"
              stroke-width="2"
            />
          }
        }
      </svg>

      @if (hoverInfo(); as h) {
        <div
          class="pointer-events-none absolute z-10 min-w-36 rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-xs shadow-lg"
          [style.left.px]="h.tipLeft"
          [style.top.px]="series().length > 1 ? 40 : 8"
          aria-live="polite"
        >
          <p class="mb-1 font-semibold text-fg">{{ h.title }}</p>
          @for (r of h.rows; track r.id) {
            <p class="flex items-center justify-between gap-3 text-muted">
              <span class="flex items-center gap-1.5"
                ><span class="inline-block size-2 rounded-full" [style.background]="r.color"></span
                >{{ r.label }}</span
              >
              <span class="font-semibold tabular-nums text-fg">{{ r.value }}</span>
            </p>
          }
        </div>
      }
    </div>
  `,
})
export class LineChart {
  readonly series = input.required<LineSeries[]>();
  readonly xLabel = input('');
  readonly yLabel = input('');
  readonly ariaLabel = input('Gráfico de líneas');
  readonly xDomain = input<[number, number] | null>(null);
  readonly yDomain = input<[number, number] | null>(null);
  readonly marker = input<ChartMarker | null>(null);
  readonly diagonal = input(false);
  readonly height = input(300);
  readonly formatX = input<(v: number) => string>((v) => String(v));
  readonly formatY = input<(v: number) => string>((v) => fmtNum(v, 2));
  readonly hoverTitle = input<(x: number) => string>((x) => String(x));

  protected readonly pad = PAD;
  protected readonly width = signal(640);
  protected readonly hover = signal<number | null>(null);
  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.box().nativeElement;
      const measure = () => this.width.set(Math.max(280, Math.round(el.clientWidth || 640)));
      measure();
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        destroyRef.onDestroy(() => ro.disconnect());
      }
    });
  }

  protected readonly plotW = computed(() => this.width() - PAD.left - PAD.right);
  protected readonly plotH = computed(() => this.height() - PAD.top - PAD.bottom);

  protected readonly xDom = computed<[number, number]>(() => {
    const d = this.xDomain();
    if (d) return d;
    const xs = this.series().flatMap((s) => s.points.map((p) => p.x));
    return [Math.min(...xs), Math.max(...xs)];
  });

  protected readonly yDom = computed<[number, number]>(() => {
    const d = this.yDomain();
    if (d) return d;
    const ys = this.series().flatMap((s) => s.points.map((p) => p.y));
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const padY = (hi - lo) * 0.08 || 0.1;
    return [Math.max(0, lo - padY), hi + padY];
  });

  sx = (x: number): number => {
    const [a, b] = this.xDom();
    return PAD.left + ((x - a) / (b - a || 1)) * this.plotW();
  };

  sy = (y: number): number => {
    const [a, b] = this.yDom();
    return PAD.top + (1 - (y - a) / (b - a || 1)) * this.plotH();
  };

  protected readonly yTicks = computed(() => {
    const [a, b] = this.yDom();
    const fmt = this.formatY();
    return Array.from({ length: 5 }, (_, i) => {
      const v = a + ((b - a) * i) / 4;
      return { v, y: this.sy(v), label: fmt(v) };
    });
  });

  protected readonly xTicks = computed(() => {
    const [a, b] = this.xDom();
    const fmt = this.formatX();
    const n = 5;
    return Array.from({ length: n + 1 }, (_, i) => {
      const v = a + ((b - a) * i) / n;
      return { v, x: this.sx(v), label: fmt(v) };
    });
  });

  protected readonly paths = computed(() =>
    this.series().map((s) => {
      const pts = s.points.map((p) => `${this.sx(p.x).toFixed(1)},${this.sy(p.y).toFixed(1)}`);
      const d = 'M' + pts.join('L');
      const base = this.sy(this.yDom()[0]).toFixed(1);
      const first = s.points[0];
      const last = s.points[s.points.length - 1];
      const areaD =
        first && last
          ? `${d}L${this.sx(last.x).toFixed(1)},${base}L${this.sx(first.x).toFixed(1)},${base}Z`
          : '';
      return { ...s, d, areaD };
    }),
  );

  /** Índices de referencia para el cursor: los puntos de la serie más larga. */
  private readonly refPoints = computed(() =>
    this.series().reduce<ChartPoint[]>(
      (acc, s) => (s.points.length > acc.length ? s.points : acc),
      [],
    ),
  );

  protected readonly hoverInfo = computed(() => {
    const i = this.hover();
    const ref = this.refPoints();
    if (i === null || !ref[i]) return null;
    const x = ref[i].x;
    const px = this.sx(x);
    const fmt = this.formatY();
    const rows = this.series()
      .map((s) => {
        const p = nearest(s.points, x);
        return p
          ? { id: s.id, label: s.label, color: s.color, value: fmt(p.y), py: this.sy(p.y) }
          : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const tipW = 160;
    const tipLeft = px + 12 + tipW > this.width() ? px - tipW - 12 : px + 12;
    return { px, rows, title: this.hoverTitle()(x), tipLeft };
  });

  protected onPointer(ev: PointerEvent): void {
    const svg = ev.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const scale = rect.width ? this.width() / rect.width : 1;
    const px = (ev.clientX - rect.left) * scale;
    const ref = this.refPoints();
    if (!ref.length) return;
    let best = 0;
    let bestDist = Infinity;
    ref.forEach((p, i) => {
      const dist = Math.abs(this.sx(p.x) - px);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    this.hover.set(best);
  }

  protected onKey(ev: KeyboardEvent): void {
    const n = this.refPoints().length;
    if (!n) return;
    const cur = this.hover();
    if (ev.key === 'ArrowRight') {
      this.hover.set(cur === null ? 0 : Math.min(n - 1, cur + 1));
    } else if (ev.key === 'ArrowLeft') {
      this.hover.set(cur === null ? n - 1 : Math.max(0, cur - 1));
    } else if (ev.key === 'Escape') {
      this.hover.set(null);
      return;
    } else {
      return;
    }
    ev.preventDefault();
  }
}

export function fmtNum(v: number, decimals: number): string {
  return v.toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function nearest(points: ChartPoint[], x: number): ChartPoint | undefined {
  let best: ChartPoint | undefined;
  let d = Infinity;
  for (const p of points) {
    const dd = Math.abs(p.x - x);
    if (dd < d) {
      d = dd;
      best = p;
    }
  }
  return best;
}
