/**
 * «Datos para contratar» (spec 2026-09-21 §4bis): qué le falta al cliente para que su póliza se pueda
 * emitir. Lo calcula asegura (que tiene la ficha y la clave para abrirla) y aquí se interpreta.
 *
 * Tres «no» que no se colapsan: no se ha podido mirar (`null`), no falta nada, y lo que falta.
 * Y un cuarto que no es suyo: un dato que tenemos pero no abre (`no_legible`) NO se le pide — es
 * una avería nuestra; se le dice que lo tenemos y que lo revisamos nosotros.
 */
import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config.ts'

export type DatoParaContratar = {
  campo: string
  etiqueta: string
  estado: 'ok' | 'falta' | 'en_revision' | 'no_legible'
  aporta: 'cliente_datos' | 'cliente_dni' | 'corredor'
  muestra: string | null
}

export type DatosParaContratar = { datos: DatoParaContratar[]; faltanCliente: number }

const ESTADOS = ['ok', 'falta', 'en_revision', 'no_legible'] as const
const APORTA = ['cliente_datos', 'cliente_dni', 'corredor'] as const

/** `null` = no se ha podido leer (401, 5xx, corte o forma rara). Jamás «no falta nada». */
export function interpretarDatosParaContratar(status: number, j: unknown): DatosParaContratar | null {
  const o = typeof j === 'object' && j !== null ? (j as Record<string, unknown>) : null
  if (status !== 200 || o?.estado !== 'ok' || !Array.isArray(o.datos) || typeof o.faltanCliente !== 'number') return null
  const datos: DatoParaContratar[] = []
  for (const d of o.datos as unknown[]) {
    const x = typeof d === 'object' && d !== null ? (d as Record<string, unknown>) : {}
    if (typeof x.campo !== 'string' || typeof x.etiqueta !== 'string'
      || !(ESTADOS as readonly unknown[]).includes(x.estado) || !(APORTA as readonly unknown[]).includes(x.aporta)) return null
    datos.push({
      campo: x.campo, etiqueta: x.etiqueta, estado: x.estado as DatoParaContratar['estado'],
      aporta: x.aporta as DatoParaContratar['aporta'], muestra: typeof x.muestra === 'string' ? x.muestra : null,
    })
  }
  return { datos, faltanCliente: o.faltanCliente }
}

/** Lo que se le dice al cliente de un dato. Nunca «falta» sobre un dato que no abre. */
export function fraseDato(d: DatoParaContratar): string {
  switch (d.estado) {
    case 'ok': return d.muestra ? `✓ ${d.muestra}` : '✓ Lo tenemos'
    case 'en_revision': return 'Recibido tu DNI: lo estamos revisando'
    case 'no_legible': return 'Lo tenemos; lo revisamos nosotros'
    case 'falta':
      if (d.aporta === 'corredor') return 'Lo confirmamos contigo al contratar. Nunca te lo pediremos por correo.'
      if (d.aporta === 'cliente_dni') return 'Falta: sube una foto de tu DNI por las dos caras'
      return d.muestra ? `Incompleto (tenemos «${d.muestra}»): corrígelo en Mis datos` : 'Falta: añádelo en Mis datos'
  }
}

export async function datosParaContratar(identidadId: string): Promise<DatosParaContratar | null> {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return null
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/api/portal/datos-emision?identidadId=${encodeURIComponent(identidadId)}`, {
      headers: { authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: control.signal,
    })
    const r = interpretarDatosParaContratar(res.status, await res.json().catch(() => null))
    if (!r) console.warn('[portal/datos-emision] respuesta no esperada:', res.status)
    return r
  } catch (e) {
    console.error('[portal/datos-emision] el puente no respondió:', e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(reloj)
  }
}
