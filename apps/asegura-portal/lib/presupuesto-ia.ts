/**
 * El resumen y las preguntas de IA del presupuesto, vistos desde el portal.
 *
 * El portal NO llama a la IA: pide al puente de asegura (`/api/portal/presupuesto`, acciones
 * `resumen_ia`, `pregunta_ia` y `llamadme`), que resuelve la ficha por `portal_vinculo`, arma el
 * prompt SOLO con datos de las opciones, valida la salida y aplica el tope. Aquí solo se interpreta
 * la respuesta, en funciones PURAS: un 401 o un corte no pueden pintarse como un resumen.
 */
import { PORTAL_PUENTE_IA_MS, PORTAL_PUENTE_TIEMPO_MS } from './puente-config.ts'
import { TEXTO_IA_NO_DISPONIBLE, TEXTO_LIMITE, TEXTO_PREGUNTA_NO_DISPONIBLE } from './presupuesto-ia-textos.ts'

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

export type RespuestaIA =
  | { estado: 'ok'; texto: string; restantes: number | null }
  | { estado: 'no_disponible'; motivo: string; restantes: number | null }
  | { estado: 'limite'; motivo: string }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'error' }

const restantesDe = (o: Record<string, unknown>) => (typeof o.restantes === 'number' && Number.isFinite(o.restantes) ? o.restantes : null)

export function interpretarRespuestaIA(status: number, j: unknown, tipo: 'resumen' | 'pregunta'): RespuestaIA {
  const o = obj(j)
  const noDisp = tipo === 'resumen' ? TEXTO_IA_NO_DISPONIBLE : TEXTO_PREGUNTA_NO_DISPONIBLE
  if (status === 200 && o.estado === 'ok' && typeof o.texto === 'string' && o.texto.trim()) {
    return { estado: 'ok', texto: o.texto.trim(), restantes: restantesDe(o) }
  }
  if (status === 200 && o.estado === 'no_disponible') return { estado: 'no_disponible', motivo: noDisp, restantes: restantesDe(o) }
  if (o.estado === 'limite') return { estado: 'limite', motivo: TEXTO_LIMITE }
  if (o.estado === 'invalido') return { estado: 'invalido', motivo: 'Escribe una pregunta (hasta 300 caracteres) y elige dos opciones distintas.' }
  return { estado: 'error' }
}

export type RespuestaLlamada = { estado: 'ok'; aviso: string | null } | { estado: 'limite' } | { estado: 'error' }

export function interpretarLlamada(status: number, j: unknown): RespuestaLlamada {
  const o = obj(j)
  if (status === 200 && o.estado === 'ok') return { estado: 'ok', aviso: typeof o.aviso === 'string' && o.aviso.trim() ? o.aviso : null }
  if (o.estado === 'limite') return { estado: 'limite' }
  return { estado: 'error' }
}

async function llamar(cuerpo: Record<string, unknown>, tiempoMs: number): Promise<{ status: number; json: unknown } | null> {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return null
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), tiempoMs)
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/api/portal/presupuesto`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify(cuerpo),
      cache: 'no-store',
      signal: control.signal,
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch (e) {
    console.error(`[portal/presupuesto-ia] el puente no respondió (${String(cuerpo.accion)}):`, e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(reloj)
  }
}

export async function pedirResumenIA(identidadId: string, presupuestoId: string): Promise<RespuestaIA> {
  const r = await llamar({ accion: 'resumen_ia', identidadId, presupuestoId }, PORTAL_PUENTE_IA_MS)
  return r ? interpretarRespuestaIA(r.status, r.json, 'resumen') : { estado: 'error' }
}

export async function preguntarIA(
  identidadId: string, presupuestoId: string, e: { opcionA: string; opcionB: string; pregunta: string },
): Promise<RespuestaIA> {
  const r = await llamar({ accion: 'pregunta_ia', identidadId, presupuestoId, ...e }, PORTAL_PUENTE_IA_MS)
  return r ? interpretarRespuestaIA(r.status, r.json, 'pregunta') : { estado: 'error' }
}

export async function pedirLlamada(identidadId: string, presupuestoId: string): Promise<RespuestaLlamada> {
  const r = await llamar({ accion: 'llamadme', identidadId, presupuestoId }, PORTAL_PUENTE_TIEMPO_MS)
  return r ? interpretarLlamada(r.status, r.json) : { estado: 'error' }
}
