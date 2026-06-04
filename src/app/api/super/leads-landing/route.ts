export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

// Estadísticas de formularios recibidos desde las landings (tabla leads_landing).
// NO son visitas de página (eso vive en Google Analytics) — son leads/formularios.
const TZ = 'Europe/Madrid'
const madridDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const supabase = createServerClient()

  const now = new Date()
  const desde30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [rowsRes, totalRes] = await Promise.all([
    supabase
      .from('leads_landing')
      .select('created_at, fuente, restaurante, estado')
      .gte('created_at', desde30)
      .order('created_at', { ascending: false }),
    supabase.from('leads_landing').select('id', { count: 'exact', head: true }),
  ])

  if (rowsRes.error) {
    return NextResponse.json({ error: rowsRes.error.message }, { status: 500 })
  }
  const rows = rowsRes.data ?? []

  const hoyStr = madridDay(now)
  const ayerStr = madridDay(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  const ms7 = now.getTime() - 7 * 24 * 60 * 60 * 1000

  let hoy = 0
  let ayer = 0
  let d7 = 0
  const fuenteHoy: Record<string, number> = {}
  const fuente30: Record<string, number> = {}

  for (const r of rows) {
    const t = new Date(r.created_at as string)
    const day = madridDay(t)
    const fuente = (r.fuente as string) || 'desconocida'
    fuente30[fuente] = (fuente30[fuente] ?? 0) + 1
    if (day === hoyStr) {
      hoy++
      fuenteHoy[fuente] = (fuenteHoy[fuente] ?? 0) + 1
    }
    if (day === ayerStr) ayer++
    if (t.getTime() >= ms7) d7++
  }

  const toArr = (o: Record<string, number>) =>
    Object.entries(o)
      .map(([fuente, n]) => ({ fuente, n }))
      .sort((a, b) => b.n - a.n)

  return NextResponse.json({
    hoy,
    ayer,
    d7,
    d30: rows.length,
    total: totalRes.count ?? rows.length,
    porFuenteHoy: toArr(fuenteHoy),
    porFuente30: toArr(fuente30),
    ultimos: rows.slice(0, 6).map((r) => ({
      fecha: r.created_at,
      fuente: (r.fuente as string) ?? 'desconocida',
      restaurante: (r.restaurante as string) ?? null,
      estado: (r.estado as string) ?? null,
    })),
  })
}
