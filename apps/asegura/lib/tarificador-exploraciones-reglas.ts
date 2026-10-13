// Explorador IA — LECTURA y REVISIÓN desde el puerto de operador (13/10/2026, fase C). Reglas PURAS: forma de lo que
// sale hacia plataforma (resumen de pasos SIN inventario, solo claves del catálogo) y el cambio de estado del mapa.
// La parte con BD está en `tarificador-exploraciones.ts`; rutas en app/api/operador/tarificador/exploraciones*.

import type { RespuestaExplorador } from '@central/module-tarificacion'

export const ESTADOS_MAPA = ['borrador', 'revisado', 'descartado'] as const
export type EstadoMapa = (typeof ESTADOS_MAPA)[number]

/** Una acción tal y como se le enseña a la persona: qué hizo y sobre qué clave. Nunca valores. */
export type AccionResumen = {
  accion: 'rellenar' | 'elegir' | 'marcar' | 'avanzar' | 'terminar' | 'parar'
  ref: string | null
  /** Clave del catálogo (rellenar). */
  dato: string | null
  /** efectoEsperado (avanzar) o motivo (parar). */
  detalle: string | null
}

export type PasoResumen = {
  n: number
  huella: string
  pantalla: string | null
  tipo: string | null
  origen: 'ia' | 'mapa' | 'regla'
  costeEur: number
  acciones: AccionResumen[]
  /** La respuesta de la IA se rechazó y el paso lo resolvió una regla. */
  rechazada: boolean
  motivo: string | null
}

const RE_CLAVE = /^[a-z][a-z0-9_.]{0,59}$/
const RE_REF = /^m\d{1,3}[ep]\d{1,4}$/
const RE_ETIQUETA = /^[a-z_]{1,40}$/
const recorta = (s: unknown, max: number): string | null => (typeof s === 'string' && s.trim() ? s.trim().slice(0, max) : null)

/** Resumen de la respuesta VALIDADA de un paso. Tolera una respuesta mal formada (devuelve lista vacía). */
export function resumirPaso(p: {
  n: number; huella: string; respuesta: unknown; origen: string; costeEur: number; errores: unknown
}): PasoResumen {
  const r = (typeof p.respuesta === 'object' && p.respuesta !== null ? p.respuesta : {}) as Partial<RespuestaExplorador>
  const lista = Array.isArray(r.acciones) ? r.acciones : []
  const acciones: AccionResumen[] = []
  for (const a of lista.slice(0, 40)) {
    const o = a as unknown as Record<string, unknown>
    const tipo = o?.accion
    if (tipo !== 'rellenar' && tipo !== 'elegir' && tipo !== 'marcar' && tipo !== 'avanzar' && tipo !== 'terminar' && tipo !== 'parar') continue
    const ref = typeof o.ref === 'string' && RE_REF.test(o.ref) ? o.ref : null
    const dato = tipo === 'rellenar' && typeof o.dato === 'string' && RE_CLAVE.test(o.dato) ? o.dato : null
    const det = tipo === 'avanzar' ? o.efectoEsperado : tipo === 'parar' ? o.motivo : null
    acciones.push({ accion: tipo, ref, dato, detalle: typeof det === 'string' && RE_ETIQUETA.test(det) ? det : null })
  }
  const pantalla = (typeof r.pantalla === 'object' && r.pantalla !== null ? r.pantalla : null) as { nombre?: unknown; tipo?: unknown } | null
  return {
    n: p.n,
    huella: p.huella,
    pantalla: recorta(pantalla?.nombre, 60),
    tipo: typeof pantalla?.tipo === 'string' && RE_ETIQUETA.test(pantalla.tipo) ? pantalla.tipo : null,
    origen: p.origen === 'ia' || p.origen === 'mapa' ? p.origen : 'regla',
    costeEur: Number.isFinite(p.costeEur) ? p.costeEur : 0,
    acciones,
    rechazada: Array.isArray(p.errores) && p.errores.length > 0,
    motivo: recorta(r.motivo, 200),
  }
}

export type CambioMapa =
  | { ok: true; estado: EstadoMapa }
  | { ok: false; mensaje: string }

/** Cuerpo de `PATCH …/exploraciones/[id]`: `{ estado: 'revisado' | 'descartado' | 'borrador' }`. */
export function leerCambioMapa(body: unknown): CambioMapa {
  const b = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  if (!b) return { ok: false, mensaje: 'cuerpo JSON requerido' }
  const estado = ESTADOS_MAPA.find((e) => e === b.estado)
  if (!estado) return { ok: false, mensaje: `estado tiene que ser uno de: ${ESTADOS_MAPA.join(', ')}` }
  return { ok: true, estado }
}

/** Transiciones del estado del mapa que ofrece la UI (y que el servidor hace cumplir): nada de «al mismo estado». */
const TRANSICIONES: Record<EstadoMapa, readonly EstadoMapa[]> = {
  borrador: ['revisado', 'descartado'],
  revisado: ['borrador'],
  descartado: ['borrador'],
}

/** ¿Se puede pasar el mapa de `desde` a `hacia`? Un descartado no se aprueba directo: antes vuelve a borrador. */
export function transicionPermitida(desde: EstadoMapa, hacia: EstadoMapa): boolean {
  return TRANSICIONES[desde].includes(hacia)
}

/** ¿Se puede pasar el mapa a `revisado`? Hace falta un mapa y la exploración cerrada. Aprobar NO genera código. */
export function puedeAprobar(f: { tieneMapa: boolean; cerrada: boolean }): 'ok' | 'sin_mapa' | 'sin_cerrar' {
  if (!f.tieneMapa) return 'sin_mapa'
  if (!f.cerrada) return 'sin_cerrar'
  return 'ok'
}

export const MENSAJE_SIN_ESQUEMA = 'Falta aplicar apps/asegura/prisma/sql/2026-10-13_tarificador_explorador.sql en la base.'
