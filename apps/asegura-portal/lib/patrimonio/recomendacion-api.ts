// RECOMENDACIÓN ENTRE PROPIETARIOS (27/10/2026) — «Invita a otro propietario»: lógica PURA (puertos inyectados, sin prisma ni sesión).
// `GET/POST /api/patrimonio/recomendaciones` y `DELETE …/[id]`. La BD real está en `recomendacion-bd.ts`; las reglas, en
// `@central/module-patrimonio` (`recomendacion.ts`).
//
// 🚨 El portal NO ENVÍA NADA a nadie: crea la recomendación (correo hasheado + caducidad) y la pantalla compone el texto que la
// persona copia o comparte ella. La identidad del invitado es el CORREO; en BD solo queda su HASH.
// 🚨 Aislamiento: solo quien tiene acceso a patrimonio (`accesos()`: cookie + `portal_vinculo`) y SOLO sobre SUS recomendaciones.
// Sin acceso, o una recomendación ajena: la MISMA 404 (nunca 403).
// 🚨 No es un oráculo: la respuesta nunca dice si el correo ya tiene cuenta, y la lista NO devuelve el correo ni su hash ni quién
// canjeó (`CAMPOS_PROHIBIDOS_EN_RECOMENDACION`): «la lista no puede decir a quién invitó».
import {
  MAX_RECOMENDACIONES_DIA,
  caducidadRecomendacion,
  estadoRecomendacion,
  finRecompensaRecomendacion,
  normalizarCorreoRecomendado,
  type EstadoRecomendacion,
} from '@central/module-patrimonio'

import type { AccesosMapa, Respuesta } from './gastos-api.ts'

const NO_ENCONTRADO: Respuesta = { status: 404, body: { error: 'no_encontrado' } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

export type FilaRecomendacionPropia = {
  id: string
  creadaEn: Date
  caducaEn: Date | null
  anuladaEn: Date | null
  canjeadaEn: Date | null
}

export interface PuertosRecomendacion {
  /** `accesosPatrimonio(identidad.id)`. */
  accesos(): Promise<AccesosMapa>
  ahora(): Date
  /** Hash del correo (`hashCanal`: trim + minúsculas + pimienta). */
  hashCorreo(correo: string): string
  /** ¿Es ese hash uno de los canales de correo de ESTA identidad? (no se recomienda uno a sí mismo). */
  esMiCorreo(correoHash: string): Promise<boolean>
  /** Recomendaciones creadas por esta identidad desde `desde` (tope diario). */
  creadasDesde(desde: Date): Promise<number>
  /** Anula las vivas ya caducadas de esa identidad y crea la nueva (UNA transacción). `repetida` = ya había una viva para ese correo. */
  crear(x: { correoHash: string; caducaEn: Date }): Promise<{ id: string | null; repetida: boolean }>
  /** SOLO las de esta identidad. */
  listar(): Promise<FilaRecomendacionPropia[]>
  /** Anula una pendiente de esta identidad. `false` = no es suya / ya no está pendiente. */
  anular(id: string): Promise<boolean>
  /** Fechas de canje de las recomendaciones en las que participa esta identidad (como quien recomendó o como invitada). */
  canjes(): Promise<Array<Date | null>>
}

async function conAcceso(p: PuertosRecomendacion): Promise<boolean> {
  return (await p.accesos()).size > 0
}

export async function responderCrearRecomendacion(p: PuertosRecomendacion, cuerpo: unknown): Promise<Respuesta> {
  if (!(await conAcceso(p))) return NO_ENCONTRADO
  const correo = normalizarCorreoRecomendado(obj(cuerpo).correo)
  if (correo === null) return { status: 400, body: { error: 'datos_invalidos', campo: 'correo' } }
  const correoHash = p.hashCorreo(correo)
  if (await p.esMiCorreo(correoHash)) return { status: 400, body: { error: 'a_si_mismo' } }
  const ahora = p.ahora()
  if ((await p.creadasDesde(new Date(ahora.getTime() - 24 * 60 * 60 * 1000))) >= MAX_RECOMENDACIONES_DIA) {
    return { status: 429, body: { error: 'limite_diario' } }
  }
  const caducaEn = caducidadRecomendacion(ahora)
  const r = await p.crear({ correoHash, caducaEn })
  // Repetir el mismo correo no duplica ni cuenta nada nuevo: misma respuesta, sin decir nada del correo.
  return { status: 201, body: { id: r.id, caducaEn: caducaEn.toISOString(), repetida: r.repetida } }
}

export type RecomendacionVista = { id: string; estado: EstadoRecomendacion; creadaEn: string; caducaEn: string | null }

export async function responderListarRecomendaciones(p: PuertosRecomendacion): Promise<Respuesta> {
  if (!(await conAcceso(p))) return NO_ENCONTRADO
  const ahora = p.ahora()
  const [filas, canjes] = await Promise.all([p.listar(), p.canjes()])
  const recomendaciones: RecomendacionVista[] = filas.map((f) => ({
    id: f.id,
    estado: estadoRecomendacion({ anuladaEn: f.anuladaEn, caducaEn: f.caducaEn, canjeadaEn: f.canjeadaEn }, ahora),
    creadaEn: f.creadaEn.toISOString(),
    caducaEn: f.caducaEn?.toISOString() ?? null,
  }))
  // La recompensa viva más reciente: hasta cuándo dura (nunca se acumulan).
  const vivas = canjes.filter((c): c is Date => c !== null).map(finRecompensaRecomendacion).filter((f) => f.getTime() > ahora.getTime())
  const hasta = vivas.length === 0 ? null : new Date(Math.max(...vivas.map((f) => f.getTime())))
  return { status: 200, body: { recomendaciones, recompensaHasta: hasta?.toISOString() ?? null } }
}

export async function responderAnularRecomendacion(p: PuertosRecomendacion, id: unknown): Promise<Respuesta> {
  if (!(await conAcceso(p)) || typeof id !== 'string' || !UUID.test(id)) return NO_ENCONTRADO
  return (await p.anular(id)) ? { status: 200, body: { ok: true } } : NO_ENCONTRADO
}
