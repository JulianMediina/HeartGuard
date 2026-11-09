import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import {
  Analisis,
  AutomaticasResultado,
  DashboardMedico,
  DashboardPaciente,
  FeatureSpec,
  HistorialEntrada,
  Informe,
  InformeCreado,
  InformeCreate,
  InformeUpdate,
  Medico,
  MedicoUpdate,
  ModeloInfo,
  Notificacion,
  NotificacionCreate,
  Paciente,
  PacienteCreate,
  PacienteUpdate,
  Paginated,
  PatientInput,
  Prediccion,
  ReentrenoResultado,
  RiskLevel,
} from '../models/api.models';
import { API_URL } from './api-url';

export type Query = Record<string, string | number | boolean | null | undefined>;

/** Parámetros de consulta sin los valores vacíos. */
export function toParams(q: Query = {}): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === null || v === undefined || v === '') continue;
    p = p.set(k, String(v));
  }
  return p;
}

/** Acepta respuestas paginadas o listas planas (por si un endpoint no pagina). */
export function asPage<T>(r: Paginated<T> | T[]): Paginated<T> {
  return Array.isArray(r) ? { count: r.length, next: null, previous: null, results: r } : r;
}

abstract class Resource {
  protected readonly http = inject(HttpClient);
  protected readonly base = inject(API_URL) + '/v1';
}

export interface PacientesQuery extends Query {
  search?: string;
  documento?: string;
  riesgo?: RiskLevel | '';
  ordering?: string;
  page?: number;
  page_size?: number;
}

@Injectable({ providedIn: 'root' })
export class PacientesService extends Resource {
  list(q: PacientesQuery = {}): Observable<Paginated<Paciente>> {
    return this.http
      .get<Paginated<Paciente> | Paciente[]>(`${this.base}/pacientes`, { params: toParams(q) })
      .pipe(map(asPage));
  }
  get(id: number): Observable<Paciente> {
    return this.http.get<Paciente>(`${this.base}/pacientes/${id}`);
  }
  create(body: PacienteCreate): Observable<Paciente> {
    return this.http.post<Paciente>(`${this.base}/pacientes`, body);
  }
  update(id: number, body: PacienteUpdate): Observable<Paciente> {
    return this.http.patch<Paciente>(`${this.base}/pacientes/${id}`, body);
  }
  me(): Observable<Paciente> {
    return this.http.get<Paciente>(`${this.base}/pacientes/me`);
  }
  updateMe(body: PacienteUpdate): Observable<Paciente> {
    return this.http.patch<Paciente>(`${this.base}/pacientes/me`, body);
  }
  historial(id: number): Observable<HistorialEntrada[]> {
    return this.http
      .get<Paginated<HistorialEntrada> | HistorialEntrada[]>(`${this.base}/pacientes/${id}/historial`, {
        params: toParams({ page_size: 200 }),
      })
      .pipe(map((r) => asPage(r).results));
  }
  addHistorial(id: number, body: { fecha: string; observacion: string }): Observable<HistorialEntrada> {
    return this.http.post<HistorialEntrada>(`${this.base}/pacientes/${id}/historial`, body);
  }
}

export interface InformesQuery extends Query {
  paciente?: number;
  riesgo?: RiskLevel | '';
  desde?: string;
  hasta?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

@Injectable({ providedIn: 'root' })
export class InformesService extends Resource {
  list(q: InformesQuery = {}): Observable<Paginated<Informe>> {
    return this.http
      .get<Paginated<Informe> | Informe[]>(`${this.base}/informes`, { params: toParams(q) })
      .pipe(map(asPage));
  }
  get(id: number): Observable<Informe> {
    return this.http.get<Informe>(`${this.base}/informes/${id}`);
  }
  create(body: InformeCreate): Observable<InformeCreado> {
    return this.http.post<InformeCreado>(`${this.base}/informes`, body);
  }
  /** Vuelve a aplicar el modelo actual a un informe existente. */
  predecir(id: number): Observable<Informe> {
    return this.http.post<Informe>(`${this.base}/informes/${id}/predecir`, {});
  }
  update(id: number, body: InformeUpdate): Observable<Informe> {
    return this.http.patch<Informe>(`${this.base}/informes/${id}`, body);
  }
}

@Injectable({ providedIn: 'root' })
export class NotificacionesService extends Resource {
  list(q: Query = {}): Observable<Paginated<Notificacion>> {
    return this.http
      .get<Paginated<Notificacion> | Notificacion[]>(`${this.base}/notificaciones`, { params: toParams(q) })
      .pipe(map(asPage));
  }
  send(body: NotificacionCreate): Observable<Notificacion> {
    return this.http.post<Notificacion>(`${this.base}/notificaciones`, body);
  }
  automaticas(): Observable<AutomaticasResultado> {
    return this.http.post<AutomaticasResultado>(`${this.base}/notificaciones/automaticas`, {});
  }
  marcarLeida(id: number, leida = true): Observable<Notificacion> {
    return this.http.patch<Notificacion>(`${this.base}/notificaciones/${id}`, { leida });
  }
  marcarTodasLeidas(): Observable<{ actualizadas: number }> {
    return this.http.post<{ actualizadas: number }>(`${this.base}/notificaciones/marcar-todas-leidas`, {});
  }
}

@Injectable({ providedIn: 'root' })
export class MedicosService extends Resource {
  me(): Observable<Medico> {
    return this.http.get<Medico>(`${this.base}/medicos/me`);
  }
  updateMe(body: MedicoUpdate): Observable<Medico> {
    return this.http.patch<Medico>(`${this.base}/medicos/me`, body);
  }
}

@Injectable({ providedIn: 'root' })
export class DashboardService extends Resource {
  medico(): Observable<DashboardMedico> {
    return this.http.get<DashboardMedico>(`${this.base}/dashboard/medico`);
  }
  paciente(): Observable<DashboardPaciente> {
    return this.http.get<DashboardPaciente>(`${this.base}/dashboard/paciente`);
  }
  analisis(q: Query = {}): Observable<Analisis> {
    return this.http.get<unknown>(`${this.base}/analisis`, { params: toParams(q) }).pipe(map(normalizeAnalisis));
  }
}

@Injectable({ providedIn: 'root' })
export class MlService extends Resource {
  features(): Observable<FeatureSpec[]> {
    return this.http
      .get<FeatureSpec[] | { features: FeatureSpec[] }>(`${this.base}/ml/features`)
      .pipe(map((r) => (Array.isArray(r) ? r : r.features)));
  }
  predict(input: PatientInput): Observable<Prediccion> {
    return this.http.post<Prediccion>(`${this.base}/ml/prediccion`, input);
  }
  modelo(): Observable<ModeloInfo> {
    return this.http.get<ModeloInfo>(`${this.base}/ml/modelo`);
  }
  reentrenar(): Observable<ReentrenoResultado> {
    return this.http.post<ReentrenoResultado>(`${this.base}/ml/reentrenar`, {});
  }
}

// ------------------------------------------------------------ normalización

type Loose = Record<string, unknown>;

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Convierte `{clave: n}` o `[{...}]` en grupos `{etiqueta, total, ...}`. */
function grupos(v: unknown, labelKeys: string[]): Analisis['por_sexo'] {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v.map((g: Loose) => {
      const etiqueta = labelKeys.map((k) => g[k]).find((x) => x !== undefined && x !== null);
      return {
        etiqueta: String(etiqueta ?? '—'),
        total: num(g['total'] ?? g['count'] ?? g['n']) ?? 0,
        alto_riesgo: num(g['alto_riesgo'] ?? g['alto']) ?? undefined,
        probabilidad_media: num(g['probabilidad_media'] ?? g['prob_media']),
      };
    });
  }
  if (typeof v === 'object') {
    return Object.entries(v as Loose).map(([k, val]) =>
      typeof val === 'object' && val
        ? {
            etiqueta: k,
            total: num((val as Loose)['total']) ?? 0,
            alto_riesgo: num((val as Loose)['alto_riesgo']) ?? undefined,
            probabilidad_media: num((val as Loose)['probabilidad_media']),
          }
        : { etiqueta: k, total: num(val) ?? 0 },
    );
  }
  return [];
}

/** Tolera variaciones razonables en la forma de `/analisis` (lista u objeto por grupo). */
export function normalizeAnalisis(raw: unknown): Analisis {
  const r = (raw ?? {}) as Loose;
  const dist = (r['distribucion_riesgo'] ?? r['por_riesgo'] ?? {}) as Loose;
  const distribucion = Array.isArray(dist)
    ? Object.fromEntries((dist as Loose[]).map((d) => [String(d['nivel_riesgo'] ?? d['nivel']), num(d['total']) ?? 0]))
    : dist;
  const medias = r['medias_por_clase'] ?? r['medias'] ?? [];
  let mediasList: Analisis['medias_por_clase'] = [];
  let totalPorClase: Analisis['total_por_clase'];
  if (Array.isArray(medias) && medias.length && (medias as Loose[])[0]['medias']) {
    // Backend: [{clase: 0|1, etiqueta, total, medias: {variable: media}}]
    const byClase = new Map((medias as Loose[]).map((m) => [Number(m['clase']), m]));
    const c0 = (byClase.get(0)?.['medias'] ?? {}) as Loose;
    const c1 = (byClase.get(1)?.['medias'] ?? {}) as Loose;
    const keys = Array.from(new Set([...Object.keys(c0), ...Object.keys(c1)]));
    mediasList = keys.map((k) => ({ variable: k, etiqueta: k, sin: num(c0[k]), con: num(c1[k]) }));
    totalPorClase = { sin: num(byClase.get(0)?.['total']) ?? 0, con: num(byClase.get(1)?.['total']) ?? 0 };
  } else if (Array.isArray(medias)) {
    mediasList = (medias as Loose[]).map((m) => ({
      variable: String(m['variable'] ?? m['nombre'] ?? ''),
      etiqueta: String(m['etiqueta'] ?? m['label_es'] ?? m['variable'] ?? ''),
      sin: num(m['sin'] ?? m['clase_0'] ?? m['0']),
      con: num(m['con'] ?? m['clase_1'] ?? m['1']),
    }));
  } else if (medias && typeof medias === 'object') {
    const m = medias as Loose;
    // Formato {"0": {var: media}, "1": {var: media}} o {var: {"0": x, "1": y}}
    if (m['0'] || m['1'] || m['sin'] || m['con']) {
      const c0 = (m['0'] ?? m['sin'] ?? {}) as Loose;
      const c1 = (m['1'] ?? m['con'] ?? {}) as Loose;
      const keys = Array.from(new Set([...Object.keys(c0), ...Object.keys(c1)]));
      mediasList = keys.map((k) => ({ variable: k, etiqueta: k, sin: num(c0[k]), con: num(c1[k]) }));
    } else {
      mediasList = Object.entries(m).map(([k, val]) => {
        const o = (val ?? {}) as Loose;
        return { variable: k, etiqueta: k, sin: num(o['0'] ?? o['sin']), con: num(o['1'] ?? o['con']) };
      });
    }
  }
  const d = distribucion as Loose;
  return {
    total_informes: num(r['total_informes'] ?? r['total']) ?? 0,
    distribucion_riesgo: {
      bajo: num(d['bajo']) ?? 0,
      moderado: num(d['moderado']) ?? 0,
      alto: num(d['alto']) ?? 0,
      sin_prediccion: num(d['sin_prediccion']) ?? 0,
    },
    por_sexo: grupos(r['por_sexo'] ?? r['sexo'], ['etiqueta', 'sexo', 'label']),
    por_edad: grupos(r['por_edad'] ?? r['edad'], ['etiqueta', 'rango', 'label']),
    por_cp: grupos(r['por_cp'] ?? r['cp'] ?? r['por_tipo_dolor'], ['etiqueta', 'cp_label', 'label', 'cp']),
    medias_por_clase: mediasList,
    total_por_clase: totalPorClase,
  };
}
