/**
 * RENOVACIÓN CON ALTERNATIVAS en la app (04/11/2026): lo que pinta la página y la llamada al puente para ELEGIR.
 *
 * Elegir NO contrata, NO firma y NO emite: el puente de asegura (`elegir_renovacion`) resuelve la ficha por
 * `portal_vinculo` con la identidad de la SESIÓN, anota la elección y devuelve el aviso para Alberto, que confirma con la
 * compañía y prepara la emisión. Aquí: textos e interpretación PUROS (test: `renovacion-vista.test.ts`) y la llamada.
 */
import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config.ts'

export const TEXTOS_RENOVACION = {
  titulo: 'Tu renovación y alternativas',
  actual: 'Tu renovación actual',
  quedarme: 'Me quedo con mi renovación',
  quiero: 'Quiero esta opción',
  noContrata: 'Elegir no contrata nada: tu corredor confirma el precio con la compañía y te dice lo que falte antes de emitir. Si eliges otra compañía, te pedirá la firma entonces.',
  vistaPrevia: 'Vista previa: así lo verá el cliente. Los botones no hacen nada.',
  caducado: 'Los precios han caducado: escríbeme y los actualizo.',
  error: 'No he podido guardar tu elección (no se ha hecho nada). Vuelve a intentarlo en un momento.',
  limite: 'Has cambiado de opinión muchas veces hoy: escríbeme y lo vemos juntos.',
  noDisponible: 'Ahora mismo no puedo recoger tu elección. Escríbeme o llámame y lo apunto yo.',
} as const

const DIA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' })
const eurEs = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`

/** «48,20€ menos que tu renovación» / «12,00€ más…» / «el mismo precio…». `null` = la renovación no consta (sin ahorro). */
export function textoDiferenciaRenovacion(prima: number | null, renovacion: number | null): string | null {
  if (prima === null || renovacion === null || !Number.isFinite(prima) || !Number.isFinite(renovacion) || renovacion <= 0) return null
  const d = Math.round((prima - renovacion) * 100) / 100
  if (d === 0) return 'el mismo precio que tu renovación'
  return `${eurEs(Math.abs(d))} ${d < 0 ? 'menos' : 'más'} que tu renovación`
}

export type EleccionVista = { tipo: 'renovacion' } | { tipo: 'opcion'; opcionId: string } | null

/** La frase de lo ya elegido. `null` = no consta que haya elegido (no se dice «no has elegido»). */
export function textoEleccionHecha(e: EleccionVista, opcion: { compania: string } | null, cuando: Date | null): string | null {
  if (e === null) return null
  const dia = cuando ? ` el ${DIA.format(cuando)}` : ''
  if (e.tipo === 'renovacion') return `Elegiste quedarte con tu renovación${dia}. Te lo confirmo yo.`
  return `Elegiste la opción de ${opcion?.compania ?? 'otra compañía'}${dia}. Te llamo para confirmarla antes de emitir nada.`
}

/** ¿Se ofrece elegir? Publicado, vigente, sin firmar ni emitir, y con la sesión del portal (no un código de WhatsApp, no un tercero). */
export function puedeElegirRenovacion(p: {
  enviadoAt: Date | null; caducado: boolean; retirado: boolean; aceptadoAt: Date | null; emitidoAt: Date | null
  accesoWhatsapp: boolean; tercero: boolean; vistaDeCorredor: boolean
}): boolean {
  return p.enviadoAt !== null && !p.caducado && !p.retirado && p.aceptadoAt === null && p.emitidoAt === null && !p.accesoWhatsapp && !p.tercero && !p.vistaDeCorredor
}

export type RespuestaEleccion = { estado: 'ok' } | { estado: 'limite' | 'caducado' | 'no_disponible' | 'error' }

/** 503 `sin_migracion` = no disponible (no «falló»); 200 `ok` = guardada. Lo demás, error: nunca se finge una elección. */
export function interpretarEleccion(status: number, j: unknown): RespuestaEleccion & { aviso?: string | null } {
  const o = j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : {}
  if (status === 200 && o.estado === 'ok') return { estado: 'ok', aviso: typeof o.aviso === 'string' && o.aviso.trim() ? o.aviso : null }
  if (o.estado === 'limite') return { estado: 'limite' }
  if (o.estado === 'caducado') return { estado: 'caducado' }
  if (status === 503) return { estado: 'no_disponible' }
  return { estado: 'error' }
}

/** El puente. La identidad la pone la ruta (de la sesión); el cuerpo del cliente solo aporta la elección. */
export async function pedirEleccion(identidadId: string, presupuestoId: string, eleccion: { eleccion: 'renovacion' } | { eleccion: 'opcion'; opcionId: string }): Promise<RespuestaEleccion & { aviso?: string | null }> {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return { estado: 'no_disponible' }
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/api/portal/presupuesto`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ accion: 'elegir_renovacion', identidadId, presupuestoId, ...eleccion }),
      cache: 'no-store',
      signal: control.signal,
    })
    return interpretarEleccion(res.status, await res.json().catch(() => null))
  } catch (e) {
    console.error('[portal/renovacion] el puente no respondió:', e instanceof Error ? e.message : e)
    return { estado: 'error' }
  } finally {
    clearTimeout(reloj)
  }
}
