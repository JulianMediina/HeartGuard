import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { diagnosticoLabel, FEATURE_CATALOG, FEATURE_SHORT, featureValue } from '../../core/features';
import { Informe, nombreCompleto, RiskLevel } from '../../core/models/api.models';
import { InformesService } from '../../core/services/api';
import { applyServerErrors, describeApiError } from '../../core/services/errors';
import { MedicalNotice } from '../../shared/components/medical-notice';
import { loadable } from '../../core/services/loadable';
import { ToastService } from '../../core/services/toast.service';
import { ErrorBanner } from '../../shared/components/error-banner';
import { FieldError } from '../../shared/components/field-error';
import { Icon } from '../../shared/components/icon';
import { PageHeader } from '../../shared/components/page-header';
import { PredictionReadout } from '../../shared/components/prediction-readout';
import { Skeleton } from '../../shared/components/skeleton';

export const RECOMENDACION: Record<RiskLevel, string> = {
  bajo: 'Riesgo bajo: mantener hábitos saludables y los controles periódicos habituales.',
  moderado: 'Riesgo moderado: se recomienda seguimiento médico y control de factores de riesgo (presión, colesterol, glucosa).',
  alto: 'Riesgo alto: requiere atención médica prioritaria. Agende una consulta con su médico lo antes posible.',
};

/**
 * Detalle de un informe. Médico: `detalle` con edición de observaciones y diagnóstico confirmado.
 * Paciente: `detalles_resultados.html` (sólo lectura del propio informe).
 */
@Component({
  selector: 'app-informe-detalle',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, PageHeader, PredictionReadout, ErrorBanner, Skeleton, Icon, FieldError, MedicalNotice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (data.state().status) {
      @case ('loading') {
        <app-skeleton shape="h-10 w-72" />
        <div class="mt-6 grid gap-5 lg:grid-cols-5"><app-skeleton class="lg:col-span-3" shape="h-96 w-full" /><app-skeleton class="lg:col-span-2" shape="h-96 w-full" /></div>
      }
      @case ('error') {
        <app-error-banner title="No pudimos cargar el informe" [message]="errorMsg()" (retry)="data.reload()" />
        <a [routerLink]="back()" class="btn btn-ghost mt-4"><app-icon name="arrowLeft" [size]="16" /> Volver</a>
      }
    }

    @if (inf(); as i) {
      <app-page-header
        [channel]="'Informe #' + i.id + ' · ' + (i.fecha | date: 'dd/MM/yyyy HH:mm')"
        [title]="esMedico() ? 'Informe de ' + nombre(i.paciente) : 'Detalle del resultado cardíaco'"
        [subtitle]="esMedico() ? 'Documento ' + i.paciente.numero_documento + (i.medico ? ' · Atendido por Dr(a). ' + nombre(i.medico) : '') : 'Información completa del análisis'"
      >
        <a [routerLink]="back()" class="btn btn-ghost"><app-icon name="arrowLeft" [size]="16" /> Volver</a>
        @if (esMedico()) {
          <a [routerLink]="['/medico/pacientes', i.paciente.id]" class="btn btn-ghost"><app-icon name="user" [size]="16" /> Ver paciente</a>
        }
      </app-page-header>

      <div class="grid items-start gap-5 lg:grid-cols-5">
        <div class="space-y-5 lg:col-span-3">
          @if (!esMedico() && i.nivel_riesgo) {
            <section class="panel stagger-in" [class.alarm]="i.nivel_riesgo === 'alto'" style="--i: 1" aria-labelledby="rec-t">
              <h2 id="rec-t" class="channel-label !text-fg">Resultado general · Recomendación</h2>
              <p class="mt-2 text-fg">{{ recomendacion(i.nivel_riesgo) }}</p>
            </section>
          }

          <section class="panel stagger-in" style="--i: 2" aria-labelledby="vars-t">
            <h2 id="vars-t" class="panel-title">Variables clínicas</h2>
            <dl class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              @for (f of features; track f.name; let k = $index) {
                <div class="stagger-in rounded-sm border border-border bg-surface-2/60 px-3 py-2" [style.--i]="k">
                  <dt class="font-mono text-[10px] tracking-widest text-muted uppercase">{{ short[f.name] }}</dt>
                  <dd class="vital mt-0.5 text-sm font-semibold text-fg">{{ valor(f.name, i) }}</dd>
                </div>
              }
            </dl>
          </section>

          <section class="panel stagger-in" style="--i: 3" aria-labelledby="diag-t">
            <h2 id="diag-t" class="panel-title">Diagnóstico y observaciones</h2>
            @if (esMedico()) {
              <form class="mt-4 space-y-4" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
                <div>
                  <label class="label" for="output">Diagnóstico confirmado</label>
                  <select id="output" class="field" formControlName="output" aria-describedby="output-h output-e">
                    <option [ngValue]="null">Sin confirmar</option>
                    <option [ngValue]="0">Enfermedad ausente</option>
                    <option [ngValue]="1">Enfermedad presente</option>
                  </select>
                  <p id="output-h" class="hint">Los informes con diagnóstico confirmado se usan para reentrenar el modelo.</p>
                  <app-field-error [control]="form.controls.output" id="output-e" [tick]="tick()" />
                </div>
                <div>
                  <label class="label" for="obs">Observaciones</label>
                  <textarea id="obs" class="field" rows="4" formControlName="observaciones" placeholder="Sin observaciones" aria-describedby="obs-e"></textarea>
                  <app-field-error [control]="form.controls.observaciones" id="obs-e" [tick]="tick()" />
                </div>
                @if (formErrors().length) {
                  <p class="text-sm text-alert-fg" role="alert">{{ formErrors().join(' ') }}</p>
                }
                @if (i.diagnostico_confirmado_en) {
                  <p class="font-mono text-[11px] text-muted">
                    Diagnóstico confirmado el {{ i.diagnostico_confirmado_en | date: 'dd/MM/yyyy HH:mm' }}{{ i.diagnostico_confirmado_por ? ' por el médico #' + i.diagnostico_confirmado_por : '' }}{{ i.is_used_for_training ? ' · ya usado para reentrenar' : '' }}
                  </p>
                }
                <button type="submit" class="btn btn-primary" [disabled]="saving() || form.pristine">
                  <app-icon name="check" [size]="16" /> {{ saving() ? 'Guardando…' : 'Guardar cambios' }}
                </button>
              </form>
            } @else {
              <dl class="dl-grid mt-4">
                <div><dt>Diagnóstico confirmado</dt><dd>{{ diagnostico(i.output) }}</dd></div>
                <div><dt>Médico</dt><dd>{{ i.medico ? 'Dr(a). ' + nombre(i.medico) : '—' }}</dd></div>
                <div class="sm:col-span-2"><dt>Observaciones adicionales</dt><dd class="whitespace-pre-line">{{ i.observaciones || 'Sin observaciones' }}</dd></div>
              </dl>
            }
          </section>
        </div>

        <div class="lg:sticky lg:top-24 lg:col-span-2" aria-live="polite">
          @if (i.probabilidad !== null && i.nivel_riesgo) {
            <app-prediction-readout
              title="Resultado de la red neuronal"
              [probability]="i.probabilidad"
              [level]="i.nivel_riesgo"
              [prediction]="i.prediccion"
              [version]="i.modelo_version"
            >
              @if (esMedico()) {
                <button type="button" class="btn btn-ghost mt-4 w-full" (click)="repredecir(i.id)" [disabled]="predicting()">
                  <app-icon name="refresh" [size]="16" [class.animate-spin]="predicting()" /> {{ predicting() ? 'Prediciendo…' : 'Volver a predecir con el modelo actual' }}
                </button>
              }
            </app-prediction-readout>
          } @else {
            <div class="panel text-center">
              <p class="channel-label">P(enfermedad)</p>
              <p class="vital mt-2 text-5xl font-bold text-muted">--,-%</p>
              <p class="mt-3 text-sm text-muted">Este informe no tiene predicción (servicio de IA no disponible o valores fuera del dominio del modelo).</p>
              @if (esMedico()) {
                <button type="button" class="btn btn-primary mt-4" (click)="repredecir(i.id)" [disabled]="predicting()">
                  <app-icon name="zap" [size]="16" /> {{ predicting() ? 'Prediciendo…' : 'Predecir ahora' }}
                </button>
              }
            </div>
          }
          @if (predictError()) {
            <p class="mt-3 rounded-sm border border-alert-border bg-alert-bg px-3 py-2 text-sm text-alert-fg" role="alert">{{ predictError() }}</p>
          }
          <app-medical-notice class="mt-4" />
        </div>
      </div>
    }
  `,
})
export class InformeDetalle {
  private readonly api = inject(InformesService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  readonly id = input.required<string>();

  protected readonly features = FEATURE_CATALOG;
  protected readonly short = FEATURE_SHORT;
  protected readonly esMedico = computed(() => this.auth.role() === 'medico');
  protected readonly back = computed(() => (this.esMedico() ? '/medico/informes' : '/paciente/resultados'));
  protected readonly data = loadable(() => this.api.get(Number(this.id())), () => this.id());
  protected readonly saved = signal<Informe | null>(null);
  protected readonly inf = computed(() => {
    const s = this.data.state();
    return this.saved() ?? (s.status === 'ready' ? s.data : null);
  });
  protected readonly errorMsg = computed(() => {
    const s = this.data.state();
    return s.status === 'error' ? s.message : '';
  });
  protected readonly saving = signal(false);
  protected readonly predicting = signal(false);
  protected readonly predictError = signal('');
  protected readonly formErrors = signal<string[]>([]);
  protected readonly tick = signal(0);

  readonly form = new FormGroup({
    output: new FormControl<0 | 1 | null>(null),
    observaciones: new FormControl<string>('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
  });

  protected readonly nombre = nombreCompleto;
  protected readonly diagnostico = diagnosticoLabel;
  protected readonly recomendacion = (l: RiskLevel) => RECOMENDACION[l];

  constructor() {
    effect(() => {
      const s = this.data.state();
      if (s.status === 'ready') {
        this.form.reset({ output: s.data.output, observaciones: s.data.observaciones ?? '' });
      }
    });
  }

  protected valor(name: string, i: Informe): string {
    return featureValue(name, (i as unknown as Record<string, number>)[name]);
  }

  repredecir(id: number): void {
    this.predicting.set(true);
    this.predictError.set('');
    this.api.predecir(id).subscribe({
      next: (r) => {
        this.predicting.set(false);
        this.saved.set(r);
        this.toast.success(`Predicción actualizada con el modelo ${r.modelo_version ?? ''}.`);
      },
      error: (err: unknown) => {
        this.predicting.set(false);
        this.predictError.set(describeApiError(err));
      },
    });
  }

  guardar(): void {
    const i = this.inf();
    if (!i || this.form.invalid) return;
    this.saving.set(true);
    this.formErrors.set([]);
    const v = this.form.getRawValue();
    this.api.update(i.id, { output: v.output, observaciones: v.observaciones || null }).subscribe({
      next: (r) => {
        this.saving.set(false);
        this.saved.set(r);
        this.form.markAsPristine();
        this.toast.success('Informe actualizado.');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.formErrors.set(applyServerErrors(this.form, err));
        this.tick.update((t) => t + 1);
      },
    });
  }
}
