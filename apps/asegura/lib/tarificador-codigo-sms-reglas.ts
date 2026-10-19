// RELEVO DEL CÓDIGO SMS por Telegram (19/10/2026, Generali/Okta) — reglas PURAS del lado asegura.
// BD en `tarificador-codigo-sms.ts`; rutas: worker `POST /api/tarificador/codigo-sms` + `GET /api/tarificador/codigo-sms/[trabajo]`,
// operador `GET|POST /api/operador/tarificador/codigo-sms` (plataforma: aviso por Telegram y entrega de la respuesta de Alberto).
// SQL: `apps/asegura/prisma/sql/2026-10-19_tarificador_codigos_sms.sql`.
//
// 🔒 El código NUNCA se guarda en claro: se SELLA con la clave pública X25519 que el worker generó en memoria para su trabajo
//    (`sellarCodigoSms`, @central/module-tarificacion/servidor). Ni la BD ni Vercel pueden abrirlo. Un uso (se borra al
//    recogerlo), TTL 10 min desde la petición, solo 4-8 dígitos. Ningún mensaje de error ni log lleva el código.

import { esTablaAusente } from './pg-error.ts'

export const SQL_CODIGOS_SMS = 'apps/asegura/prisma/sql/2026-10-19_tarificador_codigos_sms.sql'
export const MENSAJE_SIN_ACTIVAR = `codigo_sms_sin_activar: aplica el SQL ${SQL_CODIGOS_SMS} en la base`

/** Compañías cuyo bot sabe relevar el código (Okta de Generali). Otra compañía no puede abrir una petición. */
export const COMPANIAS_CODIGO_SMS: ReadonlySet<string> = new Set(['generali'])
/** Vida de una petición (y de su código): 10 min desde que el worker la abre. */
export const TTL_CODIGO_MS = 10 * 60_000
/** Lo que el worker espera el código (relevo-sms.ts `ESPERA_CODIGO_MS`) + la verificación: el lease se alarga para cubrirlo. */
export const ESPERA_WORKER_MS = 5 * 60_000 + 60_000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CLAVE_PUBLICA = /^[A-Za-z0-9_-]{43}$/
/** Referencia corta que viaja en el Telegram: los 8 primeros hex del id de la petición. */
const REF = /^[0-9a-f]{8}$/

export type Lectura<T> = { ok: true; valor: T } | { ok: false; status: 400; motivo: string }

/** `uuid` → minúsculas, o `null`. PURA. */
export function uuidValido(v: unknown): string | null {
  return typeof v === 'string' && UUID.test(v.trim()) ? v.trim().toLowerCase() : null
}

/** Cuerpo del POST del worker `{ trabajoId, clavePublica }`. PURA. */
export function leerPeticion(body: unknown): Lectura<{ trabajoId: string; clavePublica: string }> {
  const b = (typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {}) as Record<string, unknown>
  const trabajoId = uuidValido(b.trabajoId)
  if (!trabajoId) return { ok: false, status: 400, motivo: 'trabajo_invalido' }
  if (typeof b.clavePublica !== 'string' || !CLAVE_PUBLICA.test(b.clavePublica)) return { ok: false, status: 400, motivo: 'clave_publica_invalida' }
  return { ok: true, valor: { trabajoId, clavePublica: b.clavePublica } }
}

/** Referencia corta de una petición (lo que ve Alberto en el aviso). PURA. */
export function refDePeticion(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toLowerCase()
}

/** El código tal cual lo manda plataforma: SOLO 4-8 dígitos (se quitan los espacios de los bordes, nada más). PURA. */
export function leerCodigo(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return /^\d{4,8}$/.test(t) ? t : null
}

export type OrdenOperador =
  | { accion: 'avisados'; ids: string[] }
  /** `ref` opcional: sin ella solo vale si hay UNA petición viva (si hay varias, `varias`). */
  | { accion: 'entregar'; ref: string | null; codigo: string }

/** Cuerpo del POST del operador. El motivo de un rechazo NUNCA lleva el código. PURA. */
export function leerOrdenOperador(body: unknown): Lectura<OrdenOperador> {
  const b = (typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {}) as Record<string, unknown>
  if (b.accion === 'avisados') {
    if (!Array.isArray(b.ids) || b.ids.length > 50) return { ok: false, status: 400, motivo: 'ids_invalidos' }
    const ids = b.ids.map(uuidValido)
    if (ids.some((i) => i === null)) return { ok: false, status: 400, motivo: 'ids_invalidos' }
    return { ok: true, valor: { accion: 'avisados', ids: [...new Set(ids as string[])] } }
  }
  if (b.accion === 'entregar') {
    const codigo = leerCodigo(b.codigo)
    if (!codigo) return { ok: false, status: 400, motivo: 'codigo_invalido' }
    let ref: string | null = null
    if (b.ref !== undefined && b.ref !== null) {
      if (typeof b.ref !== 'string' || !REF.test(b.ref.trim().toLowerCase())) return { ok: false, status: 400, motivo: 'ref_invalida' }
      ref = b.ref.trim().toLowerCase()
    }
    return { ok: true, valor: { accion: 'entregar', ref, codigo } }
  }
  return { ok: false, status: 400, motivo: 'accion_desconocida' }
}

/** Una petición viva, tal como la lee la BD (sin el sello). */
export type FilaPeticion = { id: string; trabajoId: string; compania: string; ramo: string; caducaEn: Date; respondida: boolean; vivo: boolean }

export type Destino =
  | { tipo: 'una'; fila: FilaPeticion }
  | { tipo: 'ninguna' }
  | { tipo: 'varias'; n: number }
  /** La de esa ref existe pero ya no admite código (caducada, contestada o el trabajo ya acabó). */
  | { tipo: 'cerrada'; motivo: 'caducada' | 'ya_respondida' | 'trabajo_cerrado' }

/**
 * ¿A qué petición va el código que escribió Alberto? Con `ref`, a ESA (si sigue abierta). Sin `ref`, solo si hay exactamente
 * UNA abierta: nunca se adivina entre varias (el código de un SMS no vale para otro trabajo). PURA.
 */
export function elegirDestino(filas: readonly FilaPeticion[], ref: string | null, ahora: number): Destino {
  const abierta = (f: FilaPeticion) => f.vivo && !f.respondida && f.caducaEn.getTime() > ahora
  if (ref) {
    const f = filas.find((x) => refDePeticion(x.id) === ref)
    if (!f) return { tipo: 'ninguna' }
    if (f.respondida) return { tipo: 'cerrada', motivo: 'ya_respondida' }
    if (f.caducaEn.getTime() <= ahora) return { tipo: 'cerrada', motivo: 'caducada' }
    if (!f.vivo) return { tipo: 'cerrada', motivo: 'trabajo_cerrado' }
    return { tipo: 'una', fila: f }
  }
  const abiertas = filas.filter(abierta)
  if (abiertas.length === 1) return { tipo: 'una', fila: abiertas[0]! }
  return abiertas.length === 0 ? { tipo: 'ninguna' } : { tipo: 'varias', n: abiertas.length }
}

/** Error de BD → respuesta. Tabla ausente = SQL sin aplicar (503 claro). El mensaje de Postgres NO sale (puede llevar la fila). */
export function clasificarErrorBdCodigo(e: unknown): { status: 503; estado: 'codigo_sms_sin_activar' | 'error'; mensaje?: string } {
  if (esTablaAusente(e)) return { status: 503, estado: 'codigo_sms_sin_activar', mensaje: MENSAJE_SIN_ACTIVAR }
  return { status: 503, estado: 'error' }
}
