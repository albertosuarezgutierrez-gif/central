import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { listarFichasTarificador } from '@/lib/tarificador-fichas-asegura'

export const dynamic = 'force-dynamic'

/**
 * GET /api/correduria/tarificador/fichas[?ramo=&limite=&antes_de=] — fichas de producto del tarificador
 * (condiciones por compañía/ramo/producto/versión), leídas del puerto de operador de asegura. Solo lectura.
 * Reenvía estado y JSON tal cual (503 `sin_tabla` = falta aplicar el SQL de fichas).
 */
export async function GET(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const entrada = new URL(req.url).searchParams
  const q = new URLSearchParams()
  for (const k of ['ramo', 'limite', 'antes_de']) {
    const v = (entrada.get(k) ?? '').trim()
    if (v) q.set(k, v.slice(0, 64))
  }
  const r = await listarFichasTarificador(q)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}
