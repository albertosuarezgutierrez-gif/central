// /api/telegram/avisos — el panel 🔔 Avisos Telegram.
//
// GET  = catálogo + interruptor de cada aviso + cuántas veces ha llegado de verdad (bitácora).
// POST = enciende/apaga UN aviso o una CATEGORÍA entera.
//
// El bot es uno solo y su chat es el de Alberto (`TELEGRAM_CHAT_ID`), así que las preferencias
// NO van scopeadas por cuenta: son del bot, no de un tenant. Basta con exigir sesión.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { AVISOS, AVISOS_POR_ID, CATEGORIAS, esCritico } from '@/lib/telegram/catalogo'
import { guardarPreferencia, resumenAvisos } from '@/lib/telegram/preferencias'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const DIAS = 30

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let prefs: Map<string, boolean> | null = null
  try {
    const filas = await prisma.$queryRaw<{ aviso_id: string; activo: boolean }[]>`
      SELECT aviso_id, activo FROM telegram_avisos_pref
    `
    prefs = new Map(filas.map(f => [f.aviso_id, f.activo]))
  } catch {
    // Sin tabla (migración sin aplicar) NO se puede afirmar que todo esté activo: se dice.
    prefs = null
  }

  const resumen = await resumenAvisos(DIAS)

  const avisos = AVISOS.map(a => {
    const c = resumen?.conteos.get(a.id)
    return {
      ...a,
      activo: esCritico(a.id) ? true : (prefs?.get(a.id) ?? true),
      // `null` = la bitácora no se ha podido leer → «no se sabe», nunca 0.
      enviados: resumen ? (c?.enviados ?? 0) : null,
      omitidos: resumen ? (c?.omitidos ?? 0) : null,
      ultimo: c?.ultimo ? c.ultimo.toISOString() : null,
    }
  })

  return NextResponse.json({
    categorias: CATEGORIAS,
    avisos,
    dias: DIAS,
    // Sin estas dos, un «0 en 30 días» se leería como «este aviso no llega» cuando puede ser
    // «todavía no se ha medido». La pantalla necesita poder decir las dos cosas.
    registroDesde: resumen?.registroDesde ? resumen.registroDesde.toISOString() : null,
    bitacoraDisponible: resumen !== null,
    preferenciasDisponibles: prefs !== null,
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as { avisoId?: string; categoria?: string; activo?: boolean } | null
  if (!body || typeof body.activo !== 'boolean') {
    return NextResponse.json({ error: 'activo (boolean) requerido' }, { status: 400 })
  }

  const ids: string[] = body.categoria
    ? AVISOS.filter(a => a.categoria === body.categoria && !a.critico).map(a => a.id)
    : body.avisoId ? [body.avisoId] : []

  if (ids.length === 0) return NextResponse.json({ error: 'avisoId o categoria requerido' }, { status: 400 })
  for (const id of ids) {
    if (!AVISOS_POR_ID.has(id)) return NextResponse.json({ error: `aviso desconocido: ${id}` }, { status: 400 })
    // Defensa en profundidad: el crítico tampoco se apaga por API aunque la UI no lo ofrezca.
    if (esCritico(id)) return NextResponse.json({ error: 'este aviso no se puede silenciar' }, { status: 400 })
  }

  try {
    for (const id of ids) await guardarPreferencia(id, body.activo)
  } catch (e) {
    console.error('[telegram-avisos] no se pudo guardar la preferencia:', e)
    return NextResponse.json(
      { error: 'No se pudo guardar. ¿Está aplicada la migración `2026-09-01_telegram_avisos.sql`?' },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true, cambiados: ids.length })
}
