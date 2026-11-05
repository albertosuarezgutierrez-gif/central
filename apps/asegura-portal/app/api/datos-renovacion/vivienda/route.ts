import { NextResponse } from 'next/server'

import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'
import { viviendaCatastro } from '@/lib/vivienda-catastro'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

/**
 * `GET /api/datos-renovacion/vivienda?solicitud=&provincia=&municipio=&sigla=&calle=&numero=&planta=&puerta=&cp=` →
 * `{ estado, tipo, metros, anio }` (05/11/2026): la tarjeta «¿Es esta tu vivienda?» de la solicitud de datos de la renovación.
 * Gemela de `/api/datos/vivienda` pero con SESIÓN en vez de token (la solicitud de la app no tiene enlace público) y tope por
 * identidad (el Catastro corta si se le insiste). Datos públicos del Catastro: no enseña nada de la cartera. Calle OFICIAL del
 * callejero o no se consulta. Fallo = `sin_datos` (el formulario pregunta), nunca «no existe».
 */
export async function GET(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!rateLimit(`datos-renovacion-vivienda:${identidad.id}`, 30, 10 * 60 * 1000).allowed) return NextResponse.json({ error: 'demasiados_intentos' }, { status: 429 })
  const p = new URL(req.url).searchParams
  const t = (k: string, max = 80) => (p.get(k) ?? '').trim().toUpperCase().slice(0, max)
  const q = { provincia: t('provincia'), municipio: t('municipio'), sigla: t('sigla', 5), calle: t('calle'), numero: t('numero', 10), planta: t('planta', 10) || null, puerta: t('puerta', 10) || null, cp: t('cp', 5) || null }
  if (!q.provincia || !q.municipio || !q.sigla || !q.calle || !q.numero) return NextResponse.json({ estado: 'sin_datos', tipo: null, metros: null, anio: null })
  return NextResponse.json(await viviendaCatastro(q), { headers: { 'cache-control': 'private, max-age=600' } })
}
