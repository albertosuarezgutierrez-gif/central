import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { isCronAuthorized } from '@/lib/cron-auth'
import { tgSend } from '@central/core-telegram'
import type { NextRequest } from 'next/server'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hoy = new Date().toISOString().slice(0, 10)
  const hace60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const fallos: string[] = []
  const ok: string[] = []

  try {
    // Check 1: Duplicados activos
    const dup = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
      SELECT COUNT(*) as n FROM (
        SELECT fecha_operacion, importe, cuenta_bancaria_id FROM movimientos_bancarios
        WHERE COALESCE(duplicado_estado,'') <> 'ignorado'
        GROUP BY fecha_operacion, importe, cuenta_bancaria_id HAVING COUNT(*) > 1
      ) t
    `)
    const nDup = Number(dup[0]?.n ?? 0)
    if (nDup > 0) fallos.push(`🔴 ${nDup} grupos de duplicados activos en movimientos_bancarios`)
    else ok.push('✅ Sin duplicados activos')

    // Check 2: Backlog requiere_revision
    const rev = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
      SELECT COUNT(*) as n FROM movimientos_bancarios
      WHERE requiere_revision = true AND COALESCE(duplicado_estado,'') <> 'ignorado'
    `)
    const nRev = Number(rev[0]?.n ?? 0)
    if (nRev > 200) fallos.push(`🔴 Backlog requiere_revision: ${nRev} movimientos sin clasificar`)
    else if (nRev > 100) fallos.push(`🟡 Backlog requiere_revision: ${nRev} movimientos`)
    else ok.push(`✅ Backlog requiere_revision: ${nRev} (OK)`)

    // Check 3: Cuadre OTA vs banco (ventana 60 días)
    const cuadre = await prisma.$queryRaw<Array<{ origen: string; total: number }>>(Prisma.sql`
      SELECT 'incomes' as origen, COALESCE(SUM(amount),0)::float as total
      FROM incomes WHERE portal IN ('BOOKING','AIRBNB','EXPEDIA','AGODA')
        AND "checkOut"::date <= ${hoy}::date AND "checkOut"::date >= ${hace60}::date
      UNION ALL
      SELECT 'banco' as origen, COALESCE(SUM(importe),0)::float as total
      FROM movimientos_bancarios
      WHERE importe > 0 AND destino IN ('turistico_duplex','turistico_pisos')
        AND COALESCE(duplicado_estado,'') <> 'ignorado'
        AND fecha_operacion BETWEEN ${hace60}::date AND ${hoy}::date
    `)
    const totalInc = cuadre.find(r => r.origen === 'incomes')?.total ?? 0
    const totalBanco = cuadre.find(r => r.origen === 'banco')?.total ?? 0
    const ratio = totalInc > 0 ? totalBanco / totalInc : 0
    if (ratio < 0.7) fallos.push(`🔴 Cuadre OTA: banco ${totalBanco.toFixed(0)}€ vs incomes ${totalInc.toFixed(0)}€ (ratio ${ratio.toFixed(2)} < 0.70)`)
    else ok.push(`✅ Cuadre OTA: banco/incomes ratio ${ratio.toFixed(2)}`)

    // Check 4: Sync reciente de incomes (Smoobu)
    const ultimoSync = await prisma.$queryRaw<Array<{ ultima: Date }>>(Prisma.sql`
      SELECT MAX("createdAt") as ultima FROM incomes
    `)
    const diasDesdeSync = ultimoSync[0]?.ultima
      ? Math.floor((Date.now() - new Date(ultimoSync[0].ultima).getTime()) / 86400000)
      : 999
    if (diasDesdeSync > 2) fallos.push(`🔴 Smoobu sync: último registro hace ${diasDesdeSync} días`)
    else ok.push(`✅ Smoobu sync: activo (hace ${diasDesdeSync}d)`)

    // Check 5: Incomes con amount NULL
    const nullAmt = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
      SELECT COUNT(*) as n FROM incomes WHERE amount IS NULL AND portal IN ('BOOKING','AIRBNB','EXPEDIA')
    `)
    const nNull = Number(nullAmt[0]?.n ?? 0)
    if (nNull > 0) fallos.push(`🟡 ${nNull} incomes OTA con amount=NULL`)
    else ok.push('✅ Sin incomes con amount NULL')

    // Check 6: Alertas acumuladas sin resolver
    const alertasViejas = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
      SELECT COUNT(*) as n FROM alertas WHERE creada_at < NOW() - INTERVAL '30 days'
    `)
    const nAlertas = Number(alertasViejas[0]?.n ?? 0)
    if (nAlertas > 50) fallos.push(`🟡 ${nAlertas} alertas de más de 30 días sin resolver`)
    else ok.push(`✅ Alertas antiguas: ${nAlertas}`)

  } catch (err) {
    fallos.push(`🔴 Error ejecutando health check: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (fallos.length > 0) {
    const msg = [
      `⚕️ <b>Health Check — ${hoy}</b>`,
      '',
      ...fallos,
      '',
      `✅ ${ok.length} checks OK`,
    ].join('\n')
    await tgSend(msg, { html: true })
  }

  return NextResponse.json({ ok, fallos, timestamp: new Date().toISOString() })
}
