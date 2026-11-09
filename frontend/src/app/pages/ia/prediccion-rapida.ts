import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { PatientInput, Prediccion } from '../../core/models/api.models';
import { MlService } from '../../core/services/api';
import { applyServerErrors, describeApiError } from '../../core/services/errors';
import { ModeloStore } from '../../core/services/modelo.store';
import { EcgLine } from '../../layout/ecg-line';
import { ClinicalForm } from '../../shared/clinical-form/clinical-form';
import { ErrorBanner } from '../../shared/components/error-banner';
import { Icon } from '../../shared/components/icon';
import { MedicalNotice } from '../../shared/components/medical-notice';
import { PageHeader } from '../../shared/components/page-header';
import { PredictionReadout } from '../../shared/components/prediction-readout';
import { Skeleton } from '../../shared/components/skeleton';

type Estado = { status: 'idle' } | { status: 'loading' } | { status: 'ok'; r: Prediccion } | { status: 'error'; message: string };

/** Predicción rápida: las 13 variables → probabilidad, sin guardar ningún informe. */
@Component({
  selector: 'app-prediccion-rapida',
  imports: [RouterLink, PageHeader, ClinicalForm, PredictionReadout, ErrorBanner, Skeleton, EcgLine, MedicalNotice, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header channel="Herramienta IA · Sin guardar" title="Predicción rápida" subtitle="Estima el riesgo con la red neuronal sin crear un informe. Para registrarlo en la historia del paciente usa «Nuevo informe».">
      <a routerLink="/medico/informes/nuevo" class="btn btn-ghost"><app-icon name="filePlus" [size]="16" /> Nuevo informe</a>
    </app-page-header>
    <app-medical-notice class="stagger-in mb-5" style="--i: 1" [detail]="modelo.info()?.nota_etiqueta ?? ''" />

    <div class="grid items-start gap-5 lg:grid-cols-5">
      <app-clinical-form class="stagger-in lg:col-span-3" style="--i: 2" [busy]="estado().status === 'loading'" (submitted)="predecir($event)" />

      <div class="lg:sticky lg:top-24 lg:col-span-2" aria-live="polite" aria-atomic="true">
        @if (estado().status === 'error') {
          <app-error-banner title="No se pudo calcular la predicción" [message]="errorMsg()" (retry)="repetir()" />
        } @else if (result(); as r) {
          <app-prediction-readout
            [probability]="r.probabilidad"
            [level]="r.nivel_riesgo"
            [prediction]="r.prediccion"
            [threshold]="modelo.info()?.threshold ?? null"
            [version]="r.modelo_version"
            [busy]="estado().status === 'loading'"
          >
            <button type="button" class="btn btn-ghost mt-4 w-full" (click)="nueva()">Nueva predicción</button>
          </app-prediction-readout>
        } @else if (estado().status === 'loading') {
          <div class="panel" aria-busy="true">
            <p class="sr-only">Calculando la predicción…</p>
            <p class="channel-label animate-blink">Adquiriendo señal…</p>
            <app-skeleton class="mt-3" shape="mx-auto h-36 w-56 rounded-t-full" />
            <app-skeleton class="mt-4" shape="h-16 w-full" />
          </div>
        } @else {
          <div class="panel py-8 text-center">
            <p class="channel-label">P(enfermedad)</p>
            <p class="vital mt-2 text-5xl font-bold text-muted" aria-hidden="true">--,-<span class="text-xl">%</span></p>
            <app-ecg-line class="mt-4 h-10 opacity-60" [beats]="3" [speed]="4" />
            <p class="mt-3 font-semibold text-fg">Esperando datos del paciente</p>
            <p class="mt-1 text-sm text-muted">Completa los tres pasos y pulsa «Calcular riesgo».</p>
          </div>
        }
      </div>
    </div>
  `,
})
export class PrediccionRapida {
  private readonly ml = inject(MlService);
  protected readonly modelo = inject(ModeloStore);
  private readonly form = viewChild.required(ClinicalForm);
  protected readonly estado = signal<Estado>({ status: 'idle' });
  /** Última lectura válida: se mantiene mientras se recalcula para animar del valor anterior al nuevo. */
  private readonly last = signal<Prediccion | null>(null);
  private lastInput: PatientInput | null = null;
  private sub?: Subscription;

  protected readonly result = computed(() => {
    const e = this.estado();
    return e.status === 'ok' ? e.r : e.status === 'loading' ? this.last() : null;
  });
  protected readonly errorMsg = computed(() => {
    const e = this.estado();
    return e.status === 'error' ? e.message : '';
  });

  constructor() {
    this.modelo.ensure();
  }

  predecir(input: PatientInput): void {
    this.lastInput = input;
    this.estado.set({ status: 'loading' });
    this.sub?.unsubscribe();
    this.sub = this.ml.predict(input).subscribe({
      next: (r) => {
        this.last.set(r);
        this.estado.set({ status: 'ok', r });
      },
      error: (err: unknown) => {
        const fg = this.form().form();
        const general = fg ? applyServerErrors(fg, err) : [];
        if (fg && this.form().goToFirstInvalid()) {
          this.estado.set(this.last() ? { status: 'ok', r: this.last()! } : { status: 'idle' });
          return;
        }
        this.estado.set({ status: 'error', message: general.join(' ') || describeApiError(err) });
      },
    });
  }

  protected repetir(): void {
    if (this.lastInput) this.predecir(this.lastInput);
  }

  protected nueva(): void {
    this.sub?.unsubscribe();
    this.last.set(null);
    this.estado.set({ status: 'idle' });
    this.form().reset();
  }
}
