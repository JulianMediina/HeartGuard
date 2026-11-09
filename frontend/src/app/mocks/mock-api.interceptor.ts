import { HttpErrorResponse, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { delay, Observable, of, throwError } from 'rxjs';

import {
  DashboardMedico,
  DashboardPaciente,
  Informe,
  Paciente,
  Paginated,
  RiskLevel,
  User,
} from '../core/models/api.models';
import { MOCK_FEATURES, MOCK_METRICS, MOCK_NOTA_ETIQUETA, MOCK_TRAINING_HISTORY, mockPredict } from './ml-fixtures';
import { MockDb, pickFeatures, ref } from './mock-db';

const LATENCY_MS = 280;
const ACCESS_TTL_MS = 10 * 60 * 1000;

let db = new MockDb();
const blacklist = new Set<string>();
/** Interruptores de simulación (tests): p. ej. un reentrenamiento ya en curso → 409. */
export const mockFlags = { retraining: false };

/** Reinicia el estado (tests). */
export function resetMockDb(): MockDb {
  db = new MockDb();
  blacklist.clear();
  return db;
}

export function mockDb(): MockDb {
  return db;
}

/** Access token simulado: `mock-access.<userId>.<expira-ms>`. */
export function mockAccessToken(userId: number, ttl = ACCESS_TTL_MS): string {
  return `mock-access.${userId}.${Date.now() + ttl}`;
}

type Body = Record<string, unknown>;

class ApiError {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {}
}

const ok = <T>(body: T, status = 200) => ({ status, body });
const bad = (body: Body) => new ApiError(400, body);
const forbidden = () => new ApiError(403, { detail: 'No tiene permiso para realizar esta acción.' });
const notFound = () => new ApiError(404, { detail: 'No encontrado.' });

/**
 * Responde a `/api/v1/*` con la base de datos en memoria, imitando a DRF:
 * JWT (401 si el access caducó), permisos por rol (403), validación (400 por campo),
 * paginación `{count,next,previous,results}` y filtros del contrato.
 */
export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  const m = req.url.match(/\/api\/v1(\/[^?]*)/);
  if (!m) return next(req);
  const path = m[1].replace(/\/$/, '');
  let result: { status: number; body: unknown };
  try {
    result = route(req, path);
  } catch (e) {
    if (e instanceof ApiError) {
      return throwError(
        () => new HttpErrorResponse({ status: e.status, error: e.body, url: req.url, statusText: String(e.status) }),
      ).pipe(delayed()) as Observable<never>;
    }
    throw e;
  }
  return of(new HttpResponse({ status: result.status, body: result.body, url: req.url })).pipe(delayed());
};

function delayed<T>() {
  return (src: Observable<T>) => (LATENCY_MS ? src.pipe(delay(LATENCY_MS)) : src);
}

function currentUser(req: HttpRequest<unknown>): User {
  const h = req.headers.get('Authorization') ?? '';
  const t = h.replace(/^Bearer\s+/, '');
  const [kind, id, exp] = t.split('.');
  if (kind !== 'mock-access' || Number(exp) < Date.now()) {
    throw new ApiError(401, { detail: 'El token no es válido o ha expirado.', code: 'token_not_valid' });
  }
  const acc = db.accounts.find((a) => a.user.id === Number(id));
  if (!acc) throw new ApiError(401, { detail: 'Usuario no encontrado.' });
  return acc.user;
}

function requireRole(u: User, ...roles: User['role'][]): void {
  if (!roles.includes(u.role)) throw forbidden();
}

function params(req: HttpRequest<unknown>): URLSearchParams {
  const q = new URLSearchParams(req.url.split('?')[1] ?? '');
  req.params.keys().forEach((k) => q.set(k, req.params.get(k) ?? ''));
  return q;
}

function paginate<T>(items: T[], q: URLSearchParams, path: string): Paginated<T> {
  const size = Math.max(1, Math.min(200, Number(q.get('page_size')) || 20));
  const page = Math.max(1, Number(q.get('page')) || 1);
  const pages = Math.max(1, Math.ceil(items.length / size));
  if (page > pages && items.length) throw new ApiError(404, { detail: 'Página inválida.' });
  const link = (p: number) => {
    const c = new URLSearchParams(q);
    c.set('page', String(p));
    return `/api/v1${path}?${c.toString()}`;
  };
  return {
    count: items.length,
    next: page < pages ? link(page + 1) : null,
    previous: page > 1 ? link(page - 1) : null,
    results: items.slice((page - 1) * size, page * size),
  };
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function sortBy<T>(items: T[], ordering: string | null, get: (t: T, k: string) => unknown): T[] {
  if (!ordering) return items;
  const desc = ordering.startsWith('-');
  const key = ordering.replace(/^-/, '');
  return [...items].sort((a, b) => {
    const x = get(a, key) as string | number | null;
    const y = get(b, key) as string | number | null;
    const r = x === y ? 0 : x === null ? 1 : y === null ? -1 : x < y ? -1 : 1;
    return desc ? -r : r;
  });
}

function validarPassword(pw: unknown): string[] {
  const s = String(pw ?? '');
  const errs: string[] = [];
  if (s.length < 8) errs.push('La contraseña debe tener al menos 8 caracteres.');
  if (!/\d/.test(s) || !/[A-Z]/.test(s) || !/[a-z]/.test(s))
    errs.push('La contraseña debe incluir una mayúscula, una minúscula y un número.');
  return errs;
}

function requeridos(b: Body, campos: string[]): Body {
  const e: Body = {};
  for (const c of campos) if (b[c] === undefined || b[c] === null || String(b[c]).trim() === '') e[c] = ['Este campo es requerido.'];
  return e;
}

function informeFiltrado(u: User, q: URLSearchParams): Informe[] {
  let items = db.informes;
  if (u.role === 'paciente') items = items.filter((i) => i.paciente.id === u.profile_id);
  const pac = q.get('paciente');
  if (pac) items = items.filter((i) => i.paciente.id === Number(pac));
  const riesgo = q.get('riesgo');
  if (riesgo) items = items.filter((i) => i.nivel_riesgo === riesgo);
  const documento = q.get('documento');
  if (documento) items = items.filter((i) => i.paciente.numero_documento === documento);
  if (q.get('sin_diagnostico') === 'true') items = items.filter((i) => i.output === null);
  const output = q.get('output');
  if (output) items = items.filter((i) => String(i.output) === output);
  const pred = q.get('prediccion');
  if (pred) items = items.filter((i) => String(i.prediccion) === pred);
  const desde = q.get('desde');
  if (desde) items = items.filter((i) => i.fecha.slice(0, 10) >= desde);
  const hasta = q.get('hasta');
  if (hasta) items = items.filter((i) => i.fecha.slice(0, 10) <= hasta);
  const search = q.get('search');
  if (search) {
    const s = norm(search);
    items = items.filter((i) => norm(`${i.paciente.nombres} ${i.paciente.apellidos} ${i.paciente.numero_documento}`).includes(s));
  }
  return sortBy(items, q.get('ordering') ?? '-fecha', (i, k) => (i as unknown as Body)[k] as unknown);
}

function findPaciente(id: number): Paciente {
  const p = db.pacientes.find((x) => x.id === id);
  if (!p) throw notFound();
  return p;
}

const PACIENTE_EDITABLE = ['nombres', 'apellidos', 'direccion', 'telefono', 'fecha_nacimiento', 'departamento', 'ciudad'];

function patchPaciente(p: Paciente, b: Body): Paciente {
  const e: Body = {};
  if ('nombres' in b && !String(b['nombres'] ?? '').trim()) e['nombres'] = ['Este campo no puede estar en blanco.'];
  if ('apellidos' in b && !String(b['apellidos'] ?? '').trim()) e['apellidos'] = ['Este campo no puede estar en blanco.'];
  if (b['telefono'] && String(b['telefono']).length > 20) e['telefono'] = ['Asegúrese de que este campo no tenga más de 20 caracteres.'];
  if (Object.keys(e).length) throw bad(e);
  for (const k of PACIENTE_EDITABLE) if (k in b) (p as unknown as Body)[k] = b[k] === '' ? null : b[k];
  return p;
}

function route(req: HttpRequest<unknown>, path: string): { status: number; body: unknown } {
  const method = req.method;
  const b = (req.body ?? {}) as Body;
  const q = params(req);

  // ------------------------------------------------------------ auth (público)
  if (path === '/auth/login' && method === 'POST') {
    const acc = db.accounts.find((a) => a.user.username === b['username'] || a.user.email === b['username']);
    if (!acc || acc.password !== b['password']) {
      throw new ApiError(401, { detail: 'Usuario o contraseña incorrectos' });
    }
    return ok({ access: mockAccessToken(acc.user.id), refresh: `mock-refresh.${acc.user.id}.${Date.now()}`, user: acc.user });
  }
  if (path === '/auth/refresh' && method === 'POST') {
    const r = String(b['refresh'] ?? '');
    const [kind, id] = r.split('.');
    if (kind !== 'mock-refresh' || blacklist.has(r) || !db.accounts.some((a) => a.user.id === Number(id))) {
      throw new ApiError(401, { detail: 'El token no es válido o ha expirado.', code: 'token_not_valid' });
    }
    return ok({ access: mockAccessToken(Number(id)) });
  }
  if (path === '/auth/register' && method === 'POST') {
    const e = requeridos(b, ['email', 'password', 'password_confirmation', 'nombres', 'apellidos', 'tipo_documento', 'numero_documento']);
    if (b['email'] && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(b['email']))) e['email'] = ['Introduzca una dirección de correo electrónico válida.'];
    if (db.accounts.some((a) => a.user.email === b['email'] || a.user.username === b['email']))
      e['email'] = ['El correo electrónico ya está registrado.'];
    if (db.pacientes.some((p) => p.numero_documento === b['numero_documento']))
      e['numero_documento'] = ['Ya existe un paciente con este número de documento.'];
    if (b['password'] !== b['password_confirmation']) e['password_confirmation'] = ['Las contraseñas no coinciden.'];
    else if (b['password'] && validarPassword(b['password']).length) e['password'] = validarPassword(b['password']);
    if (Object.keys(e).length) throw bad(e);
    const p = db.nuevoPaciente(
      {
        nombres: String(b['nombres']),
        apellidos: String(b['apellidos']),
        tipo_documento: b['tipo_documento'] as Paciente['tipo_documento'],
        numero_documento: String(b['numero_documento']),
        direccion: (b['direccion'] as string) || null,
        telefono: (b['telefono'] as string) || null,
        fecha_nacimiento: (b['fecha_nacimiento'] as string) || null,
        departamento: (b['departamento'] as string) || null,
        ciudad: (b['ciudad'] as string) || null,
        email: String(b['email']),
      },
      String(b['password']),
    );
    return ok({ detail: 'El usuario ha sido registrado exitosamente.', paciente_id: p.id }, 201);
  }

  // ------------------------------------------------------------ autenticado
  const u = currentUser(req);

  if (path === '/auth/logout' && method === 'POST') {
    blacklist.add(String(b['refresh'] ?? ''));
    return ok(null, 205);
  }
  if (path === '/auth/me' && method === 'GET') return ok(u);
  if (path === '/auth/change-password' && method === 'POST') {
    const acc = db.accounts.find((a) => a.user.id === u.id)!;
    if (acc.password !== b['old_password']) throw bad({ old_password: ['La contraseña actual no es correcta.'] });
    if (b['new_password_confirmation'] !== undefined && b['new_password_confirmation'] !== b['new_password'])
      throw bad({ new_password_confirmation: ['Las nuevas contraseñas no coinciden.'] });
    const errs = validarPassword(b['new_password']);
    if (errs.length) throw bad({ new_password: errs });
    acc.password = String(b['new_password']);
    return ok(null, 204);
  }

  // ------------------------------------------------------------ médicos
  if (path === '/medicos/me') {
    requireRole(u, 'medico');
    const med = db.medicos.find((x) => x.id === u.profile_id) ?? db.medicos[0];
    if (method === 'PATCH') {
      const e: Body = {};
      if ('nombres' in b && !String(b['nombres'] ?? '').trim()) e['nombres'] = ['Este campo no puede estar en blanco.'];
      if ('apellidos' in b && !String(b['apellidos'] ?? '').trim()) e['apellidos'] = ['Este campo no puede estar en blanco.'];
      if (Object.keys(e).length) throw bad(e);
      for (const k of PACIENTE_EDITABLE) if (k in b) (med as unknown as Body)[k] = b[k] === '' ? null : b[k];
    }
    return ok(med);
  }

  // ------------------------------------------------------------ pacientes
  if (path === '/pacientes/me') {
    requireRole(u, 'paciente');
    const p = findPaciente(u.profile_id!);
    if (method === 'PATCH') patchPaciente(p, b);
    return ok(db.pacienteConResumen(p));
  }
  if (path === '/pacientes') {
    requireRole(u, 'medico', 'admin');
    if (method === 'POST') {
      const e = requeridos(b, ['email', 'nombres', 'apellidos', 'tipo_documento', 'numero_documento']);
      if (db.pacientes.some((p) => p.numero_documento === b['numero_documento']))
        e['numero_documento'] = ['Ya existe un paciente con este número de documento.'];
      if (db.accounts.some((a) => a.user.email === b['email'])) e['email'] = ['El correo electrónico ya está registrado.'];
      if (Object.keys(e).length) throw bad(e);
      // Como el backend: sin contraseña se genera una temporal que se devuelve una sola vez.
      const p_temp = Math.random().toString(36).slice(2, 10);
      const p = db.nuevoPaciente(
        {
          nombres: String(b['nombres']),
          apellidos: String(b['apellidos']),
          tipo_documento: b['tipo_documento'] as Paciente['tipo_documento'],
          numero_documento: String(b['numero_documento']),
          direccion: (b['direccion'] as string) || null,
          telefono: (b['telefono'] as string) || null,
          fecha_nacimiento: (b['fecha_nacimiento'] as string) || null,
          departamento: (b['departamento'] as string) || null,
          ciudad: (b['ciudad'] as string) || null,
          email: String(b['email']),
        },
        String(b['password'] || 'Tmp-' + p_temp),
      );
      const body: Record<string, unknown> = { ...db.pacienteConResumen(p), username: p.email };
      if (!b['password']) body['password_temporal'] = 'Tmp-' + p_temp;
      return ok(body, 201);
    }
    let items = db.pacientes.map((p) => db.pacienteConResumen(p));
    const s = q.get('search');
    if (s) items = items.filter((p) => norm(`${p.nombres} ${p.apellidos} ${p.numero_documento} ${p.email ?? ''}`).includes(norm(s)));
    const doc = q.get('documento');
    if (doc) items = items.filter((p) => p.numero_documento === doc.trim());
    const riesgo = q.get('riesgo');
    if (riesgo) items = items.filter((p) => p.ultimo_riesgo === riesgo);
    const rd = q.get('registrado_desde');
    if (rd) items = items.filter((p) => (p.fecha_registro ?? '') >= rd);
    const rh = q.get('registrado_hasta');
    if (rh) items = items.filter((p) => (p.fecha_registro ?? '').slice(0, 10) <= rh);
    items = sortBy(items, q.get('ordering') ?? 'id', (p, k) =>
      k === 'usuario__date_joined' ? (p.fecha_registro ?? null) : (p as unknown as Body)[k],
    );
    return ok(paginate(items, q, path));
  }
  let mm = path.match(/^\/pacientes\/(\d+)$/);
  if (mm) {
    requireRole(u, 'medico', 'admin');
    const p = findPaciente(Number(mm[1]));
    if (method === 'PATCH') patchPaciente(p, b);
    return ok(db.pacienteConResumen(p));
  }
  mm = path.match(/^\/pacientes\/(\d+)\/historial$/);
  if (mm) {
    requireRole(u, 'medico');
    const p = findPaciente(Number(mm[1]));
    if (method === 'POST') {
      const e = requeridos(b, ['fecha', 'observacion']);
      if (Object.keys(e).length) throw bad(e);
      return ok(db.nuevaEntrada(p.id, String(b['fecha']), String(b['observacion'])), 201);
    }
    const items = [...(db.historial.get(p.id) ?? [])].sort((a, b2) => b2.fecha.localeCompare(a.fecha));
    return ok(paginate(items, q, path));
  }

  // ------------------------------------------------------------ informes
  if (path === '/informes') {
    if (method === 'POST') {
      requireRole(u, 'medico');
      const e: Body = requeridos(b, ['documento']);
      const f = pickFeatures(b);
      if (Array.isArray(f)) for (const n of f) e[n] = ['Este campo es requerido.'];
      // Límites clínicos del backend; fuera del dominio del modelo se guarda sin predicción.
      const LIM: Record<string, [number, number]> = { age: [1, 120], trtbps: [50, 300], chol: [50, 1000], thalachh: [40, 250], oldpeak: [0, 10] };
      for (const spec of MOCK_FEATURES) {
        const v = b[spec.name];
        const [lo, hi] = LIM[spec.name] ?? [spec.min, spec.max];
        if (typeof v === 'number' && (v < lo || v > hi)) e[spec.name] = [`Asegúrese de que este valor esté entre ${lo} y ${hi}.`];
      }
      const p = db.pacientes.find((x) => x.numero_documento === String(b['documento'] ?? '').trim());
      if (b['documento'] && !p) e['documento'] = [`No se encontró un paciente con el documento: ${b['documento']}`];
      if (Object.keys(e).length) throw bad(e);
      const inf = db.nuevoInforme(p!, f as never, {
        observaciones: (b['observaciones'] as string) || null,
        output: (b['output'] as 0 | 1 | null) ?? null,
      });
      const fuera = MOCK_FEATURES.filter((s) => (b[s.name] as number) < s.min || (b[s.name] as number) > s.max);
      if (fuera.length) {
        Object.assign(inf, { probabilidad: null, prediccion: null, nivel_riesgo: null, modelo_version: null });
        return ok({ ...inf, prediccion_disponible: false, advertencia_ia: `Valores fuera del dominio del modelo (${fuera.map((s) => s.name).join(', ')}): el informe se guardó sin predicción.`, alerta_enviada: false }, 201);
      }
      const alerta = inf.nivel_riesgo === 'alto';
      if (alerta) db.nuevaNotificacion(p!, 'Su último informe indica riesgo cardíaco alto. Agende una consulta con su médico.', 'automatica');
      return ok({ ...inf, prediccion_disponible: true, advertencia_ia: null, alerta_enviada: alerta }, 201);
    }
    requireRole(u, 'medico', 'paciente');
    return ok(paginate(informeFiltrado(u, q), q, path));
  }
  const mp = path.match(/^\/informes\/(\d+)\/predecir$/);
  if (mp && method === 'POST') {
    requireRole(u, 'medico');
    const inf = db.informes.find((i) => i.id === Number(mp[1]));
    if (!inf) throw notFound();
    const fuera = MOCK_FEATURES.filter((s) => inf[s.name] < s.min || inf[s.name] > s.max);
    if (fuera.length) throw bad({ detail: `Valores fuera del dominio del modelo: ${fuera.map((s) => s.name).join(', ')}.` });
    Object.assign(inf, mockPredict(inf, db.modeloVersion));
    return ok(inf);
  }
  mm = path.match(/^\/informes\/(\d+)$/);
  if (mm) {
    const inf = db.informes.find((i) => i.id === Number(mm![1]));
    if (!inf) throw notFound();
    if (u.role === 'paciente' && inf.paciente.id !== u.profile_id) throw notFound();
    if (method === 'PATCH') {
      requireRole(u, 'medico');
      if ('output' in b && b['output'] !== null && b['output'] !== 0 && b['output'] !== 1)
        throw bad({ output: ['"' + b['output'] + '" no es una elección válida.'] });
      if ('observaciones' in b) inf.observaciones = (b['observaciones'] as string) || null;
      if ('output' in b && b['output'] !== inf.output) {
        inf.output = b['output'] as 0 | 1 | null;
        inf.diagnostico_confirmado_por = inf.output === null ? null : u.profile_id;
        inf.diagnostico_confirmado_en = inf.output === null ? null : new Date().toISOString();
        inf.is_used_for_training = false;
      }
    } else if (method !== 'GET') throw forbidden();
    return ok(inf);
  }

  // ------------------------------------------------------------ notificaciones
  if (path === '/notificaciones/automaticas' && method === 'POST') {
    requireRole(u, 'medico', 'admin');
    const altos = db.pacientes.filter((p) => db.ultimoInforme(p.id)?.nivel_riesgo === 'alto');
    // Como el backend: no repite la alerta automática a quien ya la recibió.
    const ya = new Set(db.notificaciones.filter((n) => n.tipo === 'automatica').map((n) => n.paciente.id));
    const nuevos = altos.filter((p) => !ya.has(p.id));
    for (const p of nuevos) {
      db.nuevaNotificacion(
        p,
        `Estimado/a ${p.nombres} ${p.apellidos},\n\nNuestro sistema ha detectado que usted podría estar en alto riesgo cardíaco. Recomendamos que agende una consulta con su médico de cabecera lo antes posible.`,
        'automatica',
      );
    }
    return ok({ enviadas: nuevos.length, correos_enviados: nuevos.length, omitidas: altos.length - nuevos.length });
  }
  if (path === '/notificaciones/marcar-todas-leidas' && method === 'POST') {
    requireRole(u, 'paciente');
    let n = 0;
    db.notificaciones.forEach((x) => {
      if (x.paciente.id === u.profile_id && !x.leida) {
        x.leida = true;
        n++;
      }
    });
    return ok({ actualizadas: n });
  }
  const mn = path.match(/^\/notificaciones\/(\d+)$/);
  if (mn) {
    const n = db.notificaciones.find((x) => x.id === Number(mn[1]));
    if (!n || (u.role === 'paciente' && n.paciente.id !== u.profile_id)) throw notFound();
    if (method === 'PATCH') n.leida = b['leida'] === undefined ? true : !!b['leida'];
    return ok(n);
  }
  if (path === '/notificaciones') {
    if (method === 'POST') {
      requireRole(u, 'medico');
      if (b['paciente_id'] == null && !b['documento']) throw bad({ non_field_errors: ['Indique `paciente_id` o `documento`.'] });
      const p =
        b['paciente_id'] != null
          ? db.pacientes.find((x) => x.id === Number(b['paciente_id']))
          : db.pacientes.find((x) => x.numero_documento === String(b['documento']).trim());
      if (!p) throw bad({ paciente: ['No se encontró un paciente con el identificador proporcionado.'] });
      if (!String(b['mensaje'] ?? '').trim()) throw bad({ mensaje: ['El mensaje no puede estar vacío.'] });
      return ok({ ...db.nuevaNotificacion(p, String(b['mensaje'])), email_enviado: true }, 201);
    }
    let items = db.notificaciones;
    if (u.role === 'paciente') items = items.filter((n) => n.paciente.id === u.profile_id);
    const pac = q.get('paciente');
    if (pac) items = items.filter((n) => n.paciente.id === Number(pac));
    const tipo = q.get('tipo');
    if (tipo) items = items.filter((n) => n.tipo === tipo);
    const leida = q.get('leida');
    if (leida) items = items.filter((n) => String(!!n.leida) === leida);
    if (q.get('enviadas') === 'true' && u.role === 'medico') items = items.filter((n) => n.medico?.id === u.profile_id);
    items = [...items].sort((a, c) => c.fecha_envio.localeCompare(a.fecha_envio));
    return ok(paginate(items, q, path));
  }

  // ------------------------------------------------------------ dashboards
  if (path === '/dashboard/medico') {
    requireRole(u, 'medico');
    const ultimos = db.pacientes.map((p) => db.ultimoInforme(p.id)).filter((i): i is Informe => !!i);
    const dist: Record<RiskLevel, number> = { bajo: 0, moderado: 0, alto: 0 };
    ultimos.forEach((i) => i.nivel_riesgo && dist[i.nivel_riesgo]++);
    const sinInforme = db.pacientes.length - ultimos.length;
    const meses = new Map<string, number>();
    const hoy = new Date('2026-11-09');
    for (let k = 11; k >= 0; k--) {
      const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - k, 1));
      meses.set(d.toISOString().slice(0, 7), 0);
    }
    db.informes.forEach((i) => {
      const k = i.fecha.slice(0, 7);
      if (meses.has(k)) meses.set(k, meses.get(k)! + 1);
    });
    const body: DashboardMedico = {
      total_pacientes: db.pacientes.length,
      total_informes: db.informes.length,
      alto_riesgo: dist.alto,
      distribucion_riesgo: { ...dist, sin_prediccion: sinInforme },
      mis_informes: db.informes.filter((i) => i.medico?.id === 1).length,
      pendientes_diagnostico: db.informes.filter((i) => i.output === null).length,
      informes_por_mes: [...meses].map(([mes, total]) => ({ mes, total })),
      ultimos_informes: db.informes.slice(0, 6).map((i) => ({
        id: i.id,
        fecha: i.fecha,
        probabilidad: i.probabilidad,
        prediccion: i.prediccion,
        nivel_riesgo: i.nivel_riesgo,
        output: i.output,
        paciente: i.paciente,
      })),
      notificaciones_recientes: db.notificaciones.slice(0, 5),
    };
    return ok(body);
  }
  if (path === '/dashboard/paciente') {
    requireRole(u, 'paciente');
    const p = findPaciente(u.profile_id!);
    const propios = db.informes.filter((i) => i.paciente.id === p.id).sort((a, c) => a.fecha.localeCompare(c.fecha));
    const body: DashboardPaciente = {
      paciente: db.pacienteConResumen(p),
      ultimo_informe: propios.at(-1) ?? null,
      evolucion: propios.map((i) => ({ id: i.id, fecha: i.fecha, probabilidad: i.probabilidad, nivel_riesgo: i.nivel_riesgo })),
      total_informes: propios.length,
      notificaciones_recientes: db.notificaciones.filter((n) => n.paciente.id === p.id).slice(0, 5),
      notificaciones_no_leidas: db.notificaciones.filter((n) => n.paciente.id === p.id && !n.leida).length,
    };
    return ok(body);
  }
  if (path === '/analisis') {
    requireRole(u, 'medico', 'admin');
    const items = informeFiltrado({ ...u, role: 'medico' }, q);
    const dist: Record<RiskLevel, number> = { bajo: 0, moderado: 0, alto: 0 };
    items.forEach((i) => i.nivel_riesgo && dist[i.nivel_riesgo]++);
    const agrupar = (key: (i: Informe) => string, orden: string[]) =>
      orden.map((etiqueta) => {
        const g = items.filter((i) => key(i) === etiqueta);
        return {
          etiqueta,
          total: g.length,
          alto_riesgo: g.filter((i) => i.nivel_riesgo === 'alto').length,
          probabilidad_media: g.length ? g.reduce((s, i) => s + (i.probabilidad ?? 0), 0) / g.length : null,
        };
      });
    const rango = (a: number) => (a < 40 ? '<40' : a < 50 ? '40-49' : a < 60 ? '50-59' : a < 70 ? '60-69' : '70+');
    const cpLabels = MOCK_FEATURES.find((f) => f.name === 'cp')!.options!.map((o) => o.label_es);
    const media = (xs: Informe[], k: string) =>
      xs.length ? Math.round((xs.reduce((s, i) => s + Number((i as unknown as Body)[k]), 0) / xs.length) * 100) / 100 : null;
    const vars = ['age', 'trtbps', 'chol', 'thalachh', 'oldpeak', 'caa', 'cp', 'fbs', 'exng'];
    const conf = items.filter((i) => i.output !== null);
    const body = {
      total_informes: items.length,
      distribucion_riesgo: { ...dist, sin_prediccion: items.filter((i) => !i.nivel_riesgo).length },
      por_sexo: agrupar((i) => (i.sex === 0 ? 'Mujer' : 'Hombre'), ['Mujer', 'Hombre']).map((g, k) => ({ sexo: k, ...g })),
      por_edad: agrupar((i) => rango(i.age), ['<40', '40-49', '50-59', '60-69', '70+']).map(({ etiqueta, ...g }) => ({ rango: etiqueta, ...g })),
      por_tipo_dolor: agrupar((i) => cpLabels[i.cp] ?? String(i.cp), cpLabels).map((g, k) => ({ cp: k, ...g })),
      medias_por_clase: [0, 1].map((c) => {
        const xs = conf.filter((i) => i.output === c);
        return {
          clase: c,
          etiqueta: c ? 'Enfermedad Presente' : 'Enfermedad Ausente',
          total: xs.length,
          medias: Object.fromEntries(vars.map((v) => [v, media(xs, v)])),
        };
      }),
    };
    return ok(body);
  }

  // ------------------------------------------------------------ IA
  if (path === '/ml/features' && method === 'GET') return ok(MOCK_FEATURES);
  if (path === '/ml/prediccion' && method === 'POST') {
    requireRole(u, 'medico');
    const f = pickFeatures(b);
    if (Array.isArray(f)) throw bad(Object.fromEntries(f.map((n) => [n, ['Este campo es requerido.']])));
    const fuera = MOCK_FEATURES.filter((s) => f[s.name] < s.min || f[s.name] > s.max);
    if (fuera.length) throw bad(Object.fromEntries(fuera.map((s) => [s.name, [`Fuera del rango del modelo (${s.min}–${s.max}).`]])));
    return ok(mockPredict(f, db.modeloVersion));
  }
  if (path === '/ml/modelo' && method === 'GET') {
    requireRole(u, 'medico', 'admin');
    return ok({
      version: db.modeloVersion,
      entrenado_en: db.entrenadoEn,
      threshold: MOCK_METRICS.threshold ?? null,
      metrics: MOCK_METRICS,
      features: MOCK_FEATURES,
      umbrales_riesgo: { bajo: '< 0.33', moderado: '< 0.66', alto: '>= 0.66' },
      version_previa: null,
      versiones: db.versiones,
      history: MOCK_TRAINING_HISTORY,
      nota_etiqueta: MOCK_NOTA_ETIQUETA,
      arquitectura: { hidden_sizes: [64, 32], dropout: 0.3, input_dim: 27, loss: 'bce' },
    });
  }
  if (path === '/ml/reentrenar' && method === 'POST') {
    requireRole(u, 'admin');
    if (mockFlags.retraining) throw new ApiError(409, { detail: 'Ya hay un reentrenamiento en curso.' });
    const confirmados = db.informes.filter((i) => i.output !== null).length;
    const [maj, min] = db.modeloVersion.split('.').map(Number);
    const previa = db.modeloVersion;
    db.modeloVersion = `${maj}.${min + 1}.0`;
    db.entrenadoEn = new Date().toISOString();
    const motivo = `Candidato promovido: ROC-AUC 0.9254 ≥ activo 0.9219 (${confirmados} informes confirmados).`;
    db.versiones.push({
      fecha: db.entrenadoEn,
      version: db.modeloVersion,
      version_previa: previa,
      promovido: true,
      motivo,
      roc_auc_candidato: 0.9254,
      roc_auc_activo: 0.9219,
      n_informes: confirmados,
      n_descartados: 0,
    });
    return ok({
      version: db.modeloVersion,
      metrics: { test: { ...MOCK_METRICS.test, roc_auc: 0.9254 } },
      promovido: true,
      motivo,
      n_informes: confirmados,
    });
  }

  throw notFound();
}

export { ref };
