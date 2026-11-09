import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';

import { FeatureName, FeatureSpec, PatientInput } from '../../core/models/api.models';
import { MlService } from '../../core/services/api';
import { loadable } from '../../core/services/loadable';
import { ErrorBanner } from '../components/error-banner';
import { Skeleton } from '../components/skeleton';

export interface FormStep {
  id: string;
  title: string;
  description: string;
  fields: FeatureName[];
}

/** Agrupación de las 13 variables en pasos. Variables desconocidas van al último paso. */
export const STEPS: FormStep[] = [
  {
    id: 'personal',
    title: 'Datos personales',
    description: 'Edad, sexo y mediciones básicas en reposo.',
    fields: ['age', 'sex', 'trtbps', 'chol', 'fbs'],
  },
  {
    id: 'sintomas',
    title: 'Síntomas',
    description: 'Dolor torácico y respuesta al ejercicio.',
    fields: ['cp', 'exng'],
  },
  {
    id: 'pruebas',
    title: 'Pruebas clínicas',
    description: 'Electrocardiograma, prueba de esfuerzo y estudios de imagen.',
    fields: ['restecg', 'thalachh', 'oldpeak', 'slp', 'caa', 'thall'],
  },
];

/** Pacientes reales del dataset, coherentes con su etiqueta (ver repositorio de la red neuronal). */
export const EXAMPLES = {
  enfermo: {
    label: 'Ejemplo con enfermedad',
    patient: { age: 53, sex: 1, trtbps: 123, chol: 282, fbs: 0, cp: 0, exng: 1, restecg: 1, thalachh: 95, oldpeak: 2, slp: 1, caa: 2, thall: 3 },
  },
  sano: {
    label: 'Ejemplo sano',
    patient: { age: 46, sex: 0, trtbps: 105, chol: 204, fbs: 0, cp: 1, exng: 0, restecg: 1, thalachh: 172, oldpeak: 0, slp: 2, caa: 0, thall: 2 },
  },
} satisfies Record<string, { label: string; patient: PatientInput }>;

/**
 * Límites clínicos que acepta el backend al GUARDAR un informe (`VariablesClinicasSerializer`).
 * Fuera del dominio del modelo (rango de /ml/features) el informe se guarda sin predicción.
 */
export const LIMITES_CLINICOS: Partial<Record<FeatureName, [number, number]>> = {
  age: [1, 120],
  trtbps: [50, 300],
  chol: [50, 1000],
  thalachh: [40, 250],
  oldpeak: [0, 10],
};

export type FeatureForm = FormGroup<Record<string, FormControl<number | null>>>;

/** Convierte los valores del formulario en números (la API rechaza cadenas). */
export function toPayload(raw: Record<string, number | null>): PatientInput {
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)])) as PatientInput;
}

function integer(spec: FeatureSpec): ValidatorFn {
  return (c) => {
    if (spec.step % 1 !== 0 || c.value === null || c.value === '') return null;
    return Number.isInteger(Number(c.value)) ? null : { integer: true };
  };
}

export function limitsFor(f: FeatureSpec, strict: boolean): [number, number] {
  return strict ? [f.min, f.max] : (LIMITES_CLINICOS[f.name] ?? [f.min, f.max]);
}

/**
 * `strict`: límites = dominio del modelo publicado por GET /ml/features (predicción rápida).
 * No estricto (nuevo informe): límites clínicos del backend; fuera del dominio sólo se avisa.
 */
export function buildForm(specs: FeatureSpec[], strict = true): FeatureForm {
  const controls: Record<string, FormControl<number | null>> = {};
  for (const f of specs) {
    const [lo, hi] = limitsFor(f, strict);
    const initial = f.type === 'numeric' ? roundToStep((f.min + f.max) / 2, f.step, f.min) : null;
    controls[f.name] = new FormControl<number | null>(initial, [
      Validators.required,
      Validators.min(lo),
      Validators.max(hi),
      integer(f),
    ]);
  }
  return new FormGroup(controls);
}

function roundToStep(v: number, step: number, min: number): number {
  const s = step || 1;
  const decimals = (String(s).split('.')[1] ?? '').length;
  return Number((Math.round((v - min) / s) * s + min).toFixed(decimals));
}

function fmt(v: number): string {
  return v.toLocaleString('es-CO');
}

/**
 * Formulario por pasos de las 13 variables clínicas (herramienta de IA).
 * Emite `submitted` con el payload numérico cuando todos los pasos son válidos.
 */
@Component({
  selector: 'app-clinical-form',
  imports: [ReactiveFormsModule, DecimalPipe, ErrorBanner, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './clinical-form.html',
})
export class ClinicalForm {
  private readonly ml = inject(MlService);

  readonly submitLabel = input('Calcular riesgo');
  readonly busyLabel = input('Calculando…');
  readonly busy = input(false);
  readonly showExamples = input(true);
  /** false en «Nuevo informe»: permite valores fuera del dominio del modelo (se guardan sin predicción). */
  readonly strictRange = input(true);
  readonly submitted = output<PatientInput>();

  protected readonly features = loadable(() => this.ml.features());
  readonly form = signal<FeatureForm | null>(null);
  protected readonly step = signal(0);
  protected readonly direction = signal<1 | -1>(1);
  /**
   * Espejo reactivo de los valores del formulario. El deslizador y la caja numérica se
   * sincronizan a través de él: un mismo FormControl enlazado a dos <input> no propaga
   * a los demás accesores el valor escrito en uno de ellos (Angular usa
   * emitModelToViewChange: false), que era la causa del desfase slider ↔ número.
   */
  protected readonly values = signal<Record<string, number | null>>({});
  /** Contador para recalcular errores (los controles no son signals). */
  protected readonly tick = signal(0);
  private formSub?: Subscription;

  protected readonly specs = computed(() => {
    const s = this.features.state();
    return s.status === 'ready' ? s.data : [];
  });

  protected readonly errorMessage = computed(() => {
    const s = this.features.state();
    return s.status === 'error' ? s.message : '';
  });

  protected readonly steps = computed<(FormStep & { specs: FeatureSpec[] })[]>(() => {
    const specs = this.specs();
    const byName = new Map(specs.map((f) => [f.name, f]));
    const known = new Set(STEPS.flatMap((s) => s.fields));
    const extra = specs.filter((f) => !known.has(f.name));
    return STEPS.map((s, i) => ({
      ...s,
      specs: [
        ...s.fields.map((n) => byName.get(n)).filter((f): f is FeatureSpec => !!f),
        ...(i === STEPS.length - 1 ? extra : []),
      ],
    }));
  });

  protected readonly current = computed(() => this.steps()[this.step()]);
  protected readonly isLast = computed(() => this.step() === STEPS.length - 1);
  protected readonly examples = EXAMPLES;

  constructor() {
    effect(() => {
      const specs = this.specs();
      if (specs.length && !this.form()) this.setForm(buildForm(specs, this.strictRange()));
    });
    inject(DestroyRef).onDestroy(() => this.formSub?.unsubscribe());
  }

  private setForm(form: FeatureForm): void {
    this.formSub?.unsubscribe();
    this.form.set(form);
    this.values.set(form.getRawValue());
    this.formSub = form.valueChanges.subscribe(() => {
      this.values.set(form.getRawValue());
      this.tick.update((t) => t + 1);
    });
  }

  /** Movimiento del deslizador → FormControl (que a su vez actualiza la caja numérica). */
  protected onSlide(name: string, event: Event): void {
    const c = this.control(name);
    const v = Number((event.target as HTMLInputElement).value);
    c.setValue(Number.isFinite(v) ? v : null);
    c.markAsDirty();
    c.markAsTouched();
  }

  /** Porcentaje de relleno del deslizador (acotado a la pista). */
  protected fill(spec: FeatureSpec): string {
    const v = this.values()[spec.name] ?? spec.min;
    const pct = ((Math.min(spec.max, Math.max(spec.min, v)) - spec.min) / (spec.max - spec.min || 1)) * 100;
    return pct + '%';
  }

  control(name: string): FormControl<number | null> {
    return this.form()!.controls[name];
  }

  protected isInvalid(name: string): boolean {
    this.tick();
    const c = this.form()?.controls[name];
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  protected errorFor(spec: FeatureSpec): string {
    this.tick();
    const c = this.form()?.controls[spec.name];
    if (!c?.errors) return '';
    if (c.errors['server']) return String(c.errors['server']);
    if (c.errors['required']) return spec.type === 'categorical' ? 'Selecciona una opción.' : 'Este campo es obligatorio.';
    if (c.errors['min'] || c.errors['max']) {
      const [lo, hi] = limitsFor(spec, this.strictRange());
      return `Debe estar entre ${fmt(lo)} y ${fmt(hi)}${this.strictRange() ? ' (rango admitido por el modelo)' : ''}.`;
    }
    if (c.errors['integer']) return 'Debe ser un número entero.';
    return 'Valor no válido.';
  }

  /** Valor válido pero fuera del dominio del modelo (sólo en modo no estricto). */
  protected outOfDomain(spec: FeatureSpec): boolean {
    const v = this.values()[spec.name];
    return !this.strictRange() && spec.type === 'numeric' && v != null && !this.isInvalid(spec.name) && (v < spec.min || v > spec.max);
  }

  protected useSegmented(spec: FeatureSpec): boolean {
    const opts = spec.options ?? [];
    return opts.length <= 3 && opts.every((o) => o.label_es.length <= 18);
  }

  protected next(): void {
    const form = this.form();
    if (!form) return;
    const fields = this.current().specs.map((s) => s.name);
    fields.forEach((f) => form.controls[f]?.markAsTouched());
    this.tick.update((t) => t + 1);
    if (fields.some((f) => form.controls[f]?.invalid)) {
      focusFirstInvalid();
      return;
    }
    if (this.isLast()) this.submit();
    else this.goTo(this.step() + 1);
  }

  goTo(i: number): void {
    if (i === this.step() || i < 0 || i >= STEPS.length) return;
    this.direction.set(i > this.step() ? 1 : -1);
    this.step.set(i);
  }

  /** Salta al primer paso con errores (p. ej. tras un 400 del servidor). */
  goToFirstInvalid(): boolean {
    const form = this.form();
    if (!form) return false;
    this.tick.update((t) => t + 1);
    const i = this.steps().findIndex((s) => s.specs.some((f) => form.controls[f.name].invalid));
    if (i >= 0) {
      this.goTo(i);
      focusFirstInvalid();
    }
    return i >= 0;
  }

  patch(patient: Partial<PatientInput>): void {
    const form = this.form();
    if (!form) return;
    form.patchValue(patient);
    form.markAllAsTouched();
  }

  protected fillExample(kind: keyof typeof EXAMPLES): void {
    this.patch(EXAMPLES[kind].patient);
  }

  reset(): void {
    this.setForm(buildForm(this.specs(), this.strictRange()));
    this.direction.set(-1);
    this.step.set(0);
  }

  submit(): void {
    const form = this.form();
    if (!form || this.busy()) return;
    form.markAllAsTouched();
    if (form.invalid) {
      this.goToFirstInvalid();
      return;
    }
    this.submitted.emit(toPayload(form.getRawValue()));
  }
}

function focusFirstInvalid(): void {
  setTimeout(() => document.querySelector<HTMLElement>('app-clinical-form [aria-invalid="true"]')?.focus());
}
