import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'

// Recordatorio antes del cierre (feature C): avisa por EMAIL a la empresa de los
// concursos que SIGUE (estado interesado/preparando) que cierran dentro de
// DIAS_AVISO. Idempotente: marca `recordatorio_cierre_at` tras avisar (un único
// recordatorio por seguimiento). Push no aplica (las suscripciones son de limpiadoras).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DIAS_AVISO = 3

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const ok = !!secret && (auth === `Bearer ${secret}` || req.nextUrl.searchParams.get('secret') === secret)
  if (!ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT s.id, s.empresa_id, s.licitacion, to_char(s.fin_presentacion, 'YYYY-MM-DD') AS fin_presentacion,
           (s.fin_presentacion - current_date) AS dias,
           e.nombre AS empresa_nombre, e.email AS empresa_email
    FROM concursos_seguidos s
    JOIN cuentas e ON e.id = s.empresa_id
    WHERE s.estado IN ('interesado', 'preparando')
      AND s.fin_presentacion IS NOT NULL
      AND s.fin_presentacion >= current_date
      -- ::int OBLIGATORIO: Prisma manda los números de JS como bigint y make_interval solo acepta int
      -- → 42883 «function make_interval(days => bigint) does not exist» y el cron moría en 500 a diario
      -- (desde el 30/07/2026). El resto de llamadas del repo ya llevaban el cast; esta se quedó fuera.
      AND s.fin_presentacion <= current_date + make_interval(days => ${DIAS_AVISO}::int)
      AND s.recordatorio_cierre_at IS NULL
    ORDER BY s.empresa_id, s.fin_presentacion ASC
  `)

  const transporter = getTransporter()
  const porEmpresa = new Map<string, any[]>()
  for (const r of rows) { const a = porEmpresa.get(r.empresa_id) ?? []; a.push(r); porEmpresa.set(r.empresa_id, a) }

  let empresasAvisadas = 0, recordados = 0
  for (const [, items] of porEmpresa) {
    const email = items[0].empresa_email
    const nombre = items[0].empresa_nombre || 'tu empresa'
    if (!transporter || !email) continue // sin SMTP/email → reintenta otro día (no marca)

    const filas = items.map(i => {
      const l = i.licitacion || {}
      const d = Number(i.dias)
      const cuando = d <= 0 ? 'HOY' : d === 1 ? 'mañana' : `en ${d} días`
      return `• ${l.titulo || 'Licitación'} — cierra ${cuando} (${i.fin_presentacion})${l.url ? `\n  ${l.url}` : ''}`
    }).join('\n')
    const asunto = `⏰ ${items.length} concurso${items.length === 1 ? '' : 's'} que sigues cierra${items.length === 1 ? '' : 'n'} pronto`
    const texto = `Hola,\n\nEstos concursos que sigues están a punto de cerrar su plazo de presentación:\n\n${filas}\n\nNo dejes pasar el plazo.\n\n— Agente de concursos de ${nombre}`

    try {
      await transporter.sendMail({ from: `"${nombre}" <${MAIL_FROM}>`, to: email, subject: asunto, text: texto })
      const ids = items.map(i => i.id)
      await prisma.$executeRaw(Prisma.sql`UPDATE concursos_seguidos SET recordatorio_cierre_at = now() WHERE id IN (${Prisma.join(ids)})`)
      empresasAvisadas++; recordados += ids.length
    } catch { /* transitorio → se reintenta mañana */ }
  }

  return NextResponse.json({ ok: true, candidatos: rows.length, recordados, empresas_avisadas: empresasAvisadas })
}
