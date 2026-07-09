import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'
import { eur } from '@/lib/dinero'

// Avisos proactivos de concursos NUEVOS (feature B): digest por EMAIL de los
// matches del radar (sector+zona) aparecidos en las últimas 48 h que aún no se
// han enviado, para empresas con el radar activo. Idempotente vía
// `avisado_email_at`. Push no aplica (las suscripciones son de limpiadoras).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const ok = !!secret && (auth === `Bearer ${secret}` || req.nextUrl.searchParams.get('secret') === secret)
  if (!ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT a.id, a.empresa_id, a.anuncio, a.puntuacion,
           e.nombre AS empresa_nombre, e.email AS empresa_email
    FROM concursos_radar_anuncios a
    JOIN cuentas e ON e.id = a.empresa_id
    JOIN concursos_perfil_empresa p ON p.empresa_id = a.empresa_id
    WHERE a.avisado_email_at IS NULL
      AND a.created_at >= now() - interval '2 days'
      AND p.radar_activo = true
    ORDER BY a.empresa_id, a.puntuacion DESC, a.created_at DESC
  `)

  const transporter = getTransporter()
  const porEmpresa = new Map<string, any[]>()
  for (const r of rows) { const arr = porEmpresa.get(r.empresa_id) ?? []; arr.push(r); porEmpresa.set(r.empresa_id, arr) }

  let empresasAvisadas = 0, avisados = 0
  for (const [, items] of porEmpresa) {
    const email = items[0].empresa_email
    const nombre = items[0].empresa_nombre || 'tu empresa'
    if (!transporter || !email) continue // sin SMTP/email → se limpia al envejecer (no marca aquí)

    const top = items.slice(0, 20)
    const filas = top.map(i => {
      const l = i.anuncio || {}
      const pres = l.presupuesto ? ` · ${eur(Number(l.presupuesto))}` : ''
      const fin = l.fin_presentacion ? ` · cierra ${l.fin_presentacion}` : ''
      return `• ${l.titulo || 'Licitación'}${l.provincia ? ` (${l.provincia})` : ''}${pres}${fin}${l.url ? `\n  ${l.url}` : ''}`
    }).join('\n')
    const extra = items.length > top.length ? `\n\n…y ${items.length - top.length} más en tu panel.` : ''
    const asunto = `🔔 ${items.length} concurso${items.length === 1 ? '' : 's'} nuevo${items.length === 1 ? '' : 's'} para ${nombre}`
    const texto = `Hola,\n\nHan aparecido estos concursos que encajan con tu radar (sector/zona):\n\n${filas}${extra}\n\nEntra en tu panel → Concursos para verlos y seguirlos.\n\n— Agente de concursos de ${nombre}`

    try {
      await transporter.sendMail({ from: `"${nombre}" <${MAIL_FROM}>`, to: email, subject: asunto, text: texto })
      const ids = items.map(i => i.id)
      await prisma.$executeRaw(Prisma.sql`UPDATE concursos_radar_anuncios SET avisado_email_at = now() WHERE id IN (${Prisma.join(ids)})`)
      empresasAvisadas++; avisados += ids.length
    } catch { /* transitorio → se reintenta mañana */ }
  }

  // Matches viejos (>2 días) nunca enviados → márcalos sin email (evita un blast de backfill).
  await prisma.$executeRaw(Prisma.sql`UPDATE concursos_radar_anuncios SET avisado_email_at = now()
    WHERE avisado_email_at IS NULL AND created_at < now() - interval '2 days'`)

  return NextResponse.json({ ok: true, candidatos: rows.length, avisados, empresas_avisadas: empresasAvisadas })
}
