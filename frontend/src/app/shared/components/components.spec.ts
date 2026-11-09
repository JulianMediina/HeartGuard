import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ConfusionMatrix, flareColor, inkFor } from './confusion-matrix';
import { CountUp } from './count-up';
import { Pagination } from './pagination';
import { RiskBadge } from './risk-badge';
import { RiskGauge } from './risk-gauge';

describe('CountUp (regresión: anima en cada cambio y siempre llega al valor final)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Forzar el camino animado (los tests no tienen matchMedia → movimiento reducido).
    vi.stubGlobal('matchMedia', () => ({ matches: false }) as MediaQueryList);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('cuenta hasta el valor y vuelve a animar cuando cambia', async () => {
    const f = TestBed.createComponent(CountUp);
    f.componentRef.setInput('value', 50);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(1400);
    f.detectChanges();
    expect(f.nativeElement.textContent.trim()).toBe('50');

    f.componentRef.setInput('value', 80);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(100);
    f.detectChanges();
    const mid = Number(f.nativeElement.textContent.trim());
    expect(mid).toBeGreaterThanOrEqual(50);
    await vi.advanceTimersByTimeAsync(1400);
    f.detectChanges();
    expect(f.nativeElement.textContent.trim()).toBe('80');
  });

  it('respeta decimales y sufijo con formato español', async () => {
    const f = TestBed.createComponent(CountUp);
    f.componentRef.setInput('value', 12.345);
    f.componentRef.setInput('decimals', 1);
    f.componentRef.setInput('suffix', '%');
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(1400);
    f.detectChanges();
    expect(f.nativeElement.textContent.trim()).toBe('12,3%');
  });
});

describe('RiskGauge', () => {
  it('expone la probabilidad en el aria-label', () => {
    const f = TestBed.createComponent(RiskGauge);
    f.componentRef.setInput('probability', 0.734);
    f.detectChanges();
    expect(f.nativeElement.querySelector('svg').getAttribute('aria-label')).toContain('73.4');
  });
});

describe('RiskBadge', () => {
  for (const [level, text] of [
    ['bajo', 'Riesgo bajo'],
    ['moderado', 'Riesgo moderado'],
    ['alto', 'Riesgo alto'],
  ] as const) {
    it(`nivel ${level}: texto e icono, no sólo color`, () => {
      const f = TestBed.createComponent(RiskBadge);
      f.componentRef.setInput('level', level);
      f.detectChanges();
      expect(f.nativeElement.textContent).toContain(text);
      expect(f.nativeElement.querySelector('svg')).not.toBeNull();
    });
  }
});

describe('ConfusionMatrix', () => {
  it('pinta las 4 celdas con porcentaje por fila', () => {
    const f = TestBed.createComponent(ConfusionMatrix);
    f.componentRef.setInput('matrix', [
      [15, 6],
      [3, 22],
    ]);
    f.detectChanges();
    const cells = f.nativeElement.querySelectorAll('[role="cell"]');
    expect(cells).toHaveLength(4);
    expect(cells[3].textContent).toContain('88%');
  });

  it('elige una tinta legible según el fondo', () => {
    expect(inkFor(flareColor(0))).toBe('#241027');
    expect(inkFor(flareColor(1))).toBe('#ffffff');
  });
});

describe('Pagination', () => {
  it('muestra elipsis y emite la página elegida', () => {
    const f = TestBed.createComponent(Pagination);
    f.componentRef.setInput('page', 5);
    f.componentRef.setInput('count', 200);
    f.componentRef.setInput('pageSize', 20);
    f.detectChanges();
    const labels = [...f.nativeElement.querySelectorAll('li')].map((l: HTMLElement) => l.textContent!.trim());
    expect(labels).toEqual(['', '1', '…', '4', '5', '6', '…', '10', '']);
    const spy = vi.fn();
    f.componentInstance.pageChange.subscribe(spy);
    (f.nativeElement.querySelector('[aria-label="Página 6"]') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledWith(6);
    expect(f.nativeElement.querySelector('[aria-current="page"]').textContent.trim()).toBe('5');
  });
});
