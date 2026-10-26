import { NextResponse } from 'next/server'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { tokenSolicitudVivo } from '@/lib/solicitud-datos'
import { viviendaCatastro } from '@/lib/vivienda-catastro'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

/**
 * `GET /api/datos/vivienda?token=&provincia=&municipio=&sigla=&calle=&numero=&planta=&puerta=&cp=` →
 * `{ estado, tipo, metros, anio }` (26/10/2026): lo que el Catastro dice de la vivienda, para la tarjeta «¿Es esta tu
 * vivienda?» del enlace de hogar. Sin sesión: token de solicitud VIVO + tope por IP (el Catastro corta si se le
 * insiste). La calle tiene que ser la OFICIAL del callejero (`sigla` + `calle`): escrita a mano no se consulta.
 * Fallo = `sin_datos` (el formulario pregunta), nunca «no existe».
 */
export async function GET(req: Request) {
  if (!rateLimit(`datos-vivienda:${getIp(req)}`, 30, 10 * 60 * 1000).allowed) return NextResponse.json({ error: 'demasiados_intentos' }, { status: 429 })
  const p = new URL(req.url).searchParams
  if (!(await tokenSolicitudVivo((p.get('token') ?? '').trim()))) return NextResponse.json({ error: 'enlace_no_valido' }, { status: 410 })
  const t = (k: string, max = 80) => (p.get(k) ?? '').trim().toUpperCase().slice(0, max)
  const q = { provincia: t('provincia'), municipio: t('municipio'), sigla: t('sigla', 5), calle: t('calle'), numero: t('numero', 10), planta: t('planta', 10) || null, puerta: t('puerta', 10) || null, cp: t('cp', 5) || null }
  if (!q.provincia || !q.municipio || !q.sigla || !q.calle || !q.numero) return NextResponse.json({ estado: 'sin_datos', tipo: null, metros: null, anio: null })
  return NextResponse.json(await viviendaCatastro(q), { headers: { 'cache-control': 'private, max-age=600' } })
}
