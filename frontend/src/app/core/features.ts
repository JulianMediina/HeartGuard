import { FeatureName, FeatureSpec } from './models/api.models';
import { MOCK_FEATURES } from '../mocks/ml-fixtures';

/**
 * Catálogo estático de las 13 variables (copia de `heart_nn.features.FEATURES`). Sirve para
 * etiquetar tablas sin pedir `/ml/features`; el formulario de la IA usa siempre el endpoint.
 */
export const FEATURE_CATALOG: FeatureSpec[] = MOCK_FEATURES;

const BY_NAME = new Map(FEATURE_CATALOG.map((f) => [f.name, f]));

export const FEATURE_UNITS: Partial<Record<FeatureName, string>> = {
  age: 'años',
  trtbps: 'mm Hg',
  chol: 'mg/dl',
  thalachh: 'lpm',
  oldpeak: 'mm',
};

/** Cabeceras cortas de la tabla de informes (las del `historial_medico.html` original). */
export const FEATURE_SHORT: Record<FeatureName, string> = {
  age: 'Edad',
  sex: 'Sexo',
  cp: 'Tipo de dolor',
  trtbps: 'Presión arterial',
  chol: 'Colesterol',
  fbs: 'Azúcar ayunas',
  restecg: 'ECG',
  thalachh: 'FC máx',
  exng: 'Angina',
  oldpeak: 'Depresión ST',
  slp: 'Pendiente ST',
  caa: 'Vasos coloreados',
  thall: 'Talasemia',
};

export function featureLabel(name: string): string {
  return BY_NAME.get(name as FeatureName)?.label_es ?? FEATURE_SHORT[name as FeatureName] ?? name;
}

/** Texto legible de un valor (opción categórica o número con unidad). */
export function featureValue(name: string, value: number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const v = typeof value === 'boolean' ? Number(value) : value;
  const spec = BY_NAME.get(name as FeatureName);
  const opt = spec?.options?.find((o) => o.value === v);
  if (opt) return opt.label_es;
  const unit = FEATURE_UNITS[name as FeatureName];
  const txt = Number.isInteger(v) ? String(v) : v.toLocaleString('es-CO', { maximumFractionDigits: 2 });
  return unit ? `${txt} ${unit}` : txt;
}

export const DIAGNOSTICO: Record<string, string> = {
  '0': 'Enfermedad ausente',
  '1': 'Enfermedad presente',
};

export function diagnosticoLabel(output: 0 | 1 | null | undefined): string {
  return output === null || output === undefined ? 'Sin confirmar' : DIAGNOSTICO[String(output)];
}
