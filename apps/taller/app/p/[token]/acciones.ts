'use server'
// Aceptación PÚBLICA por token (sin sesión). El token fija el taller (RLS) y localiza el presupuesto por su hash.
// Token inválido o desconocido → 404 sin pistas.
import { headers } from 'next/headers'
import { z } from 'zod'
import { conTaller } from '@/lib/db'
import { configDe } from '@/lib/contexto'
import { ipDeCabecera } from '@/lib/ip'
import { aceptarPorToken, rechazarPorToken, tallerDeToken, type TxPresupuestos } from '@/lib/presupuestos'

export type RespuestaPublica = { ok: true } | { ok: false; status: 404 | 409 | 400; mensaje: string }

const Casillas = z.object({ asegura: z.boolean(), taller: z.boolean() })

export async function aceptarPublico(token: unknown, casillas: unknown): Promise<RespuestaPublica> {
  const tallerId = tallerDeToken(token)
  const c = Casillas.safeParse(casillas)
  if (!tallerId) return { ok: false, status: 404, mensaje: 'No encontrado' }
  if (!c.success) return { ok: false, status: 400, mensaje: 'Datos inválidos' }
  const h = await headers()
  try {
    const r = await conTaller(tallerId, async (tx) => {
      const config = await configDe(tx, tallerId)
      if (!config) return { ok: false as const, status: 404 as const, motivo: 'no encontrado' }
      return aceptarPorToken(tx as unknown as TxPresupuestos, {
        tallerId, token: token as string, ip: ipDeCabecera(h.get('x-forwarded-for')), userAgent: h.get('user-agent')?.slice(0, 300) ?? null,
        ahora: new Date(), casillas: c.data,
      }, { textoTaller: { version: config.textos.versionTextoComercialTaller, texto: config.textos.textoConsentimientoComercialTaller } })
    }, { timeout: 20_000 })
    return r.ok ? { ok: true } : { ok: false, status: r.status, mensaje: r.status === 404 ? 'No encontrado' : r.motivo }
  } catch (e) {
    console.error('[p/aceptar]', e)
    return { ok: false, status: 409, mensaje: 'No se pudo registrar la aceptación. Inténtalo de nuevo' }
  }
}

export async function rechazarPublico(token: unknown): Promise<RespuestaPublica> {
  const tallerId = tallerDeToken(token)
  if (!tallerId) return { ok: false, status: 404, mensaje: 'No encontrado' }
  try {
    const r = await conTaller(tallerId, (tx) => rechazarPorToken(tx as unknown as TxPresupuestos, { tallerId, token: token as string, ahora: new Date() }))
    return r.ok ? { ok: true } : { ok: false, status: r.status, mensaje: r.status === 404 ? 'No encontrado' : r.motivo }
  } catch (e) {
    console.error('[p/rechazar]', e)
    return { ok: false, status: 409, mensaje: 'No se pudo completar. Inténtalo de nuevo' }
  }
}
