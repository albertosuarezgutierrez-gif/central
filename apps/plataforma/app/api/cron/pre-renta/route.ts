import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isCronAuthorized } from '@/lib/cron-auth'
import { aiComplete } from '@/lib/ai-client'
import { tgAviso } from '@/lib/telegram'
import { eur } from '@/lib/dinero'

export const dynamic = 'force-dynamic'

// GET /api/cron/pre-renta
// Se ejecuta el 1 de marzo a las 9:00. Genera un informe de deducciones de cuota IRPF
// para la declaración de renta del año anterior y lo envía por Telegram.
// Incluye: mecenazgo, guardería, deportiva Andalucía + consejo IA sobre casillas y justificantes.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Guard: solo en marzo
  const ahora = new Date()
  if (ahora.getMonth() !== 2) {
    return NextResponse.json({ skipped: true, reason: 'No es marzo' })
  }

  const yearRenta = ahora.getFullYear() - 1

  // Traer todas las cuentas con movimientos de deducciones de cuota ese año
  const cuentas = await prisma.$queryRaw<{ cuenta_id: string; nombre: string }[]>`
    SELECT DISTINCT c.id AS cuenta_id, c.nombre
    FROM cuentas c
    JOIN cuentas_bancarias cb ON cb.cuenta_id = c.id
    JOIN movimientos_bancarios mb ON mb.cuenta_bancaria_id = cb.id
    WHERE mb.deduccion_cuota_tipo IS NOT NULL
      AND mb.importe < 0
      AND EXTRACT(year FROM mb.fecha_operacion) = ${yearRenta}
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
  `

  let procesadas = 0
  for (const cuenta of cuentas) {
    try {
      const totalesRows = await prisma.$queryRaw<{ tipo: string; total: unknown; count: unknown }[]>`
        SELECT mb.deduccion_cuota_tipo AS tipo,
               SUM(ABS(mb.importe)) AS total,
               COUNT(*) AS count
        FROM movimientos_bancarios mb
        JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
        WHERE cb.cuenta_id = ${cuenta.cuenta_id}::uuid
          AND mb.deduccion_cuota_tipo IS NOT NULL
          AND mb.importe < 0
          AND EXTRACT(year FROM mb.fecha_operacion) = ${yearRenta}
          AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
        GROUP BY mb.deduccion_cuota_tipo
      `

      const cuotaLabel: Record<string, string> = {
        mecenazgo: '🏛️ Mecenazgo (Ley 49/2002)',
        guarderia: '👶 Guardería (Art.81bis LIRPF)',
        deportiva_and: '⚽ Deportiva Andalucía (D.A.1ª Ley 7/2021)',
      }
      const cuotaLimite: Record<string, number> = {
        mecenazgo: 150, guarderia: 1000, deportiva_and: 100,
      }

      const seccionCuota = totalesRows.map(r => {
        const total = Number(r.total)
        const count = Number(r.count)
        const label = cuotaLabel[r.tipo] ?? r.tipo
        const limite = (cuotaLimite[r.tipo] ?? 0) as number
        let cuota = 0
        if (r.tipo === 'mecenazgo') cuota = Math.round(Math.min(total, 150) * 0.8 + Math.max(0, total - 150) * 0.4)
        else if (r.tipo === 'guarderia') cuota = Math.min(total, 1000)
        else if (r.tipo === 'deportiva_and') cuota = Math.round(Math.min(total, 100) * 0.15)
        const excede = total > limite ? ` ⚠️ excede límite base (${eur(limite)})` : ''
        return `• ${label}\n  Gastado: ${eur(total)} (${count} pagos)${excede}\n  → <b>Deducción cuota: −${eur(cuota)}</b>`
      }).join('\n\n')

      const promptIA = [
        `Eres el asesor fiscal de Alberto (correduría de seguros + pisos turísticos, IRPF España ${yearRenta}).`,
        `Es 1 de marzo: temporada de declaración de renta. Deducciones de cuota especiales registradas:`,
        '',
        seccionCuota,
        '',
        'Redacta un mensaje conciso (máx 200 palabras) con:',
        '1. Qué casillas de la declaración rellenar con estos datos (sé específico: casilla XXX)',
        '2. Si necesita justificantes adicionales (certificados de donación, facturas guardería, recibos gimnasio)',
        '3. Un consejo práctico para maximizar la deducción en el ejercicio actual',
        '',
        'Responde en español, tono profesional pero cercano. Sin markdown.',
      ].join('\n')

      let consejo = ''
      try {
        consejo = await aiComplete([{ role: 'user', content: promptIA }])
      } catch { /* continuar sin consejo IA */ }

      const mensaje = [
        `📋 <b>Informe Pre-Renta ${yearRenta} — Deducciones de cuota</b>`,
        '',
        seccionCuota,
        '',
        consejo ? `💡 <b>Consejo fiscal:</b>\n${consejo.trim()}` : '',
      ].filter(Boolean).join('\n')

      await tgAviso('finanzas.pre-renta', mensaje.slice(0, 4096)).catch(() => {})
      procesadas++
    } catch (e) {
      console.error('[pre-renta] Error cuenta', cuenta.cuenta_id, e instanceof Error ? e.message : String(e))
    }
  }

  return NextResponse.json({ ok: true, procesadas, year: yearRenta })
}
