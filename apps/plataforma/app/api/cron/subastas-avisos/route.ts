// Aviso por Telegram de las subastas nuevas que han casado.
//
// UN solo mensaje agregado por pasada (patrón de `facturas-conciliar-gmail`),
// no uno por subasta: el ruido es justo lo que hace que Alberto no lea las 200
// alertas del BOE que ya tiene sin abrir.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { tgSend, tgSendButtons } from '@central/core-telegram'
import { prisma } from '@/lib/db'
import { isCronAuthorized } from '@/lib/cron-auth'
import { eur } from '@/lib/dinero'
import { esEmpresaInmobiliaria } from '@central/module-subastas'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_EN_MENSAJE = 10
/** Los matches que llevan más de esto sin avisar se silencian: son backfill. */
const DIAS_FRESCURA = 2

/**
 * Señal ANTICIPADA: promotoras/inmobiliarias en concurso de acreedores en las
 * provincias vigiladas. Sus inmuebles suelen acabar en subasta o liquidación
 * meses después — enterarse hoy da ventaja. Ventana de 1 día (el cron es
 * diario): sin estado extra que deduplicar.
 */
async function avisarAntesalaConcursal(): Promise<number> {
  const provincias = await prisma.$queryRaw<Array<{ p: string }>>(Prisma.sql`
    SELECT DISTINCT unnest(provincias) AS p FROM subastas_criterios WHERE activo = true
  `)
  if (!provincias.length) return 0

  const eventos = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT empresa, provincia, fecha, url FROM borme_eventos
    WHERE tipo = 'concurso'
      AND created_at >= now() - interval '1 day'
      AND provincia = ANY(${provincias.map((x) => x.p)}::text[])
    ORDER BY fecha DESC
    LIMIT 50
  `)
  const inmobiliarias = eventos.filter((e) => esEmpresaInmobiliaria(e.empresa))
  if (!inmobiliarias.length) return 0

  const lineas = [`🏗️ <b>Antesala de subastas</b> — ${inmobiliarias.length} empresa${inmobiliarias.length > 1 ? 's' : ''} del ladrillo en concurso en tus provincias`, '']
  for (const e of inmobiliarias.slice(0, 6)) {
    lineas.push(`• <b>${escapar(e.empresa)}</b> (${escapar(e.provincia ?? '—')})`)
  }
  lineas.push('', '<i>Sus inmuebles pueden acabar en subasta o liquidación en los próximos meses.</i>')
  await tgSend(lineas.join('\n'), { html: true }).catch(() => {})
  return inmobiliarias.length
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const pendientes = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, cuenta_id, dedupe_key, subasta, puntuacion, coste_total, descuento, fecha_fin
      FROM subastas_radar
      WHERE avisado_at IS NULL
        AND descartado = false
        AND created_at >= now() - make_interval(days => ${DIAS_FRESCURA}::int)
      ORDER BY puntuacion DESC NULLS LAST, created_at DESC
    `)

    if (!pendientes.length) {
      // Backfill viejo: se marca como avisado sin mandar nada, para no soltar
      // una ráfaga la primera vez que se enciende el radar.
      const silenciados = await prisma.$executeRaw(Prisma.sql`
        UPDATE subastas_radar SET avisado_at = now()
        WHERE avisado_at IS NULL AND created_at < now() - make_interval(days => ${DIAS_FRESCURA}::int)
      `)
      return NextResponse.json({ ok: true, avisados: 0, silenciados: Number(silenciados) })
    }

    // Un mensaje POR SUBASTA con botones [👀 Seguir][🚫 Descartar]: el volumen
    // diario real es de 0-4, así que no es ruido, y la decisión de Alberto
    // queda registrada (el descarte alimenta el aprendizaje). Si un día llega
    // una avalancha, el resto va agregado como antes.
    for (const p of pendientes.slice(0, MAX_EN_MENSAJE)) {
      const s = p.subasta ?? {}
      const punt = p.puntuacion == null ? 'sin datos para puntuar' : `${p.puntuacion}/100`
      const coste = p.coste_total == null ? null : eur(Number(p.coste_total))
      const cierre = p.fecha_fin ? new Date(p.fecha_fin).toLocaleDateString('es-ES') : null

      const lineas = [`⚖️ <b>${escapar(s.identificador ?? p.dedupe_key)}</b> — ${punt}`]
      if (s.descripcion) lineas.push(escapar(String(s.descripcion).slice(0, 160)))
      const pie = [s.provincia, coste ? `coste estimado ${coste}` : null, cierre ? `cierra ${cierre}` : null]
        .filter(Boolean)
        .join(' · ')
      if (pie) lineas.push(`<i>${escapar(pie)}</i>`)
      if (s.url) lineas.push(escapar(s.url))

      await tgSendButtons(lineas.join('\n'), [[
        { texto: '👀 Seguir', callback: `subr:seguir:${p.id}` },
        { texto: '🚫 Descartar', callback: `subr:desc:${p.id}` },
      ]]).catch(() => {})
    }
    if (pendientes.length > MAX_EN_MENSAJE) {
      await tgSend(`⚖️ …y ${pendientes.length - MAX_EN_MENSAJE} subastas más en /subastas`, { html: true }).catch(() => {})
    }

    await prisma.$executeRaw(Prisma.sql`
      UPDATE subastas_radar SET avisado_at = now()
      WHERE id = ANY(${pendientes.map((p) => p.id)}::uuid[])
    `)

    const antesala = await avisarAntesalaConcursal().catch(() => 0)

    return NextResponse.json({ ok: true, avisados: pendientes.length, antesala })
  } catch (e: any) {
    console.error('[subastas-avisos]', e)
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
  }
}
