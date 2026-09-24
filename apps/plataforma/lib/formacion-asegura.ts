// Formación continua IDD (horas por persona y año) en la pantalla de la correduría.
//
//   1. Lo PURO (lectura del puerto, contador) lo importa el client component y lo prueba
//      `test/regression-formacion-asegura.test.ts`.
//   2. La RED, solo desde la ruta API. Esta app no toca `seguros`: reenvía al puerto de asegura.
import { cabecerasPuerto } from './puerto-actor.ts'

export type EstadoFormacion = 'cumplido' | 'en_curso' | 'atrasado' | 'incumplido' | 'baja'
/** Copia de `ESTADOS` implícitos en `module-seguros/formacion.ts`; el test compara con el módulo. */
export const ESTADOS_FORMACION: readonly EstadoFormacion[] = ['cumplido', 'en_curso', 'atrasado', 'incumplido', 'baja']

export type CursoFormacion = {
  id: string
  persona: string
  curso: string
  entidad: string | null
  fecha: string
  horas: number
  documentoId: string | null
  creadaPor: string
}
export type PersonaFormacion = {
  persona: string
  horas: number
  faltan: number
  estado: EstadoFormacion
  /** `YYYY-MM-DD` desde el que dejó de distribuir. Ausente en un asegura anterior → `null`. */
  bajaDesde: string | null
}
export type ResumenFormacion = { año: number; minimo: number; personas: PersonaFormacion[]; pendientes: number }

export type LecturaFormacion =
  | { estado: 'ok'; cursos: CursoFormacion[]; resumen: ResumenFormacion }
  | { estado: 'sin_configurar' }
  | { estado: 'no_desplegado' }
  | { estado: 'error'; motivo: string }

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const txt = (v: unknown): v is string => typeof v === 'string'

function curso(v: unknown): CursoFormacion | null {
  const o = (v ?? {}) as Record<string, unknown>
  if (!txt(o.id) || !txt(o.persona) || !txt(o.curso) || !txt(o.fecha) || !num(o.horas) || !txt(o.creadaPor)) return null
  return {
    id: o.id, persona: o.persona, curso: o.curso, entidad: txt(o.entidad) ? o.entidad : null,
    fecha: o.fecha, horas: o.horas, documentoId: txt(o.documentoId) ? o.documentoId : null, creadaPor: o.creadaPor,
  }
}

function persona(v: unknown): PersonaFormacion | null {
  const o = (v ?? {}) as Record<string, unknown>
  if (!txt(o.persona) || !num(o.horas) || !num(o.faltan)) return null
  if (!ESTADOS_FORMACION.includes(o.estado as EstadoFormacion)) return null
  if (o.bajaDesde !== undefined && o.bajaDesde !== null && !(txt(o.bajaDesde) && /^\d{4}-\d{2}-\d{2}$/.test(o.bajaDesde))) return null
  return { persona: o.persona, horas: o.horas, faltan: o.faltan, estado: o.estado as EstadoFormacion, bajaDesde: txt(o.bajaDesde) ? o.bajaDesde : null }
}

/** Una fila que no se entiende tumba la lectura entera: un resumen con una persona de menos diría que no existe. */
export function interpretarFormacion(status: number, json: unknown): LecturaFormacion {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404) return { estado: 'no_desplegado' }
  if (status !== 200 || o.estado !== 'ok') return { estado: 'error', motivo: String(o.causa ?? o.motivo ?? `HTTP ${status}`) }
  const r = (o.resumen ?? {}) as Record<string, unknown>
  if (!Array.isArray(o.cursos) || !Array.isArray(r.personas) || !num(r.año) || !num(r.minimo) || !num(r.pendientes)) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  const cursos = o.cursos.map(curso)
  const personas = r.personas.map(persona)
  if (cursos.some((c) => c === null) || personas.some((p) => p === null)) return { estado: 'error', motivo: 'respuesta_ilegible' }
  return {
    estado: 'ok',
    cursos: cursos as CursoFormacion[],
    resumen: { año: r.año, minimo: r.minimo, personas: personas as PersonaFormacion[], pendientes: r.pendientes },
  }
}

/** Contador de la pestaña: los que piden acción. `null` = no se pudo leer (nunca 0). */
export function contadorFormacion(l: LecturaFormacion): number | null {
  return l.estado === 'ok' ? l.resumen.pendientes : null
}

export const TEXTO_ESTADO: Record<EstadoFormacion, string> = {
  cumplido: 'Cumplido',
  en_curso: 'En curso',
  atrasado: 'Atrasado: apúntate a un curso ya',
  incumplido: 'Año cerrado sin las horas',
  baja: 'Dejó de distribuir: no se le exigen',
}

// ─── Red (solo desde la ruta API) ────────────────────────────────────────────

export type Reenvio = { status: number; json: unknown }

async function llamar(path: string, init: RequestInit): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  const base = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...(await cabecerasPuerto(secret)), ...(init.body ? { 'content-type': 'application/json' } : {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

export function formacionAsegura(año: number): Promise<Reenvio> {
  return llamar(`/api/operador/formacion?a%C3%B1o=${año}`, { method: 'GET' })
}

export function registrarCursoAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/formacion', { method: 'POST', body: JSON.stringify(body) })
}

export function borrarCursoAsegura(id: string): Promise<Reenvio> {
  return llamar(`/api/operador/formacion?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function anotarBajaAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/formacion/baja', { method: 'POST', body: JSON.stringify(body) })
}

export function quitarBajaAsegura(persona: string): Promise<Reenvio> {
  return llamar(`/api/operador/formacion/baja?persona=${encodeURIComponent(persona)}`, { method: 'DELETE' })
}
