// /api/cron/alertas-pendientes — Aviso semanal a la empresa de sus alertas SIN resolver.
// Motivación (11/07/2026): Vanessa (Sique Brilla) no revisa el panel 🔔 — su badge no es un
// canal fiable. Este cron le empuja un email a `empresas.email` cuando le quedan alertas
// ACCIONABLES sin leer con cierta antigüedad. Excluye el log 'asignacion_auto' (historial del
// robot, ya se inserta leído). Si no hay nada pendiente, no envía. Multi-tenant: itera empresas.
// Auth: Bearer CRON_SECRET (o ?secret= para disparo manual). Degrada limpio sin SMTP.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'
import { resumenAlertasPendientes, type AlertaPendiente } from '@/lib/alertas-resumen'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Antigüedad mínima para avisar: da margen a que Vanessa la vea/resuelva en el panel.
const DIAS_MIN = 3

type Row = {
  empresa_id: string
  empresa_nombre: string
  empresa_email: string | null
  titulo: string
  descripcion: string | null
  tipo: string
  creada_at: Date
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const ok = !!secret && (auth === `Bearer ${secret}` || req.nextUrl.searchParams.get('secret') === secret)
  if (!ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT a.empresa_id, e.nombre AS empresa_nombre, e.email AS empresa_email,
           a.titulo, a.descripcion, a.tipo, a.creada_at
    FROM alertas a
    JOIN empresas e ON e.id = a.empresa_id
    WHERE a.leida = false
      AND a.tipo <> 'asignacion_auto'
      AND a.creada_at < NOW() - (${DIAS_MIN} || ' days')::interval
      AND e.activa = true
    ORDER BY a.empresa_id, a.creada_at DESC
  `)

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, empresas_con_backlog: 0, enviados: 0 })
  }

  // Agrupar por empresa.
  const porEmpresa = new Map<string, { nombre: string; email: string | null; items: AlertaPendiente[] }>()
  for (const r of rows) {
    const g = porEmpresa.get(r.empresa_id) ?? { nombre: r.empresa_nombre, email: r.empresa_email, items: [] }
    g.items.push({ titulo: r.titulo, descripcion: r.descripcion, tipo: r.tipo, creada_at: r.creada_at })
    porEmpresa.set(r.empresa_id, g)
  }

  const transporter = getTransporter()
  let enviados = 0
  for (const [, g] of porEmpresa) {
    if (!g.email || !transporter) continue
    const { asunto, texto } = resumenAlertasPendientes(g.nombre, g.items)
    try {
      await transporter.sendMail({ from: `${g.nombre} <${MAIL_FROM}>`, to: g.email, subject: asunto, text: texto })
      enviados++
    } catch { /* no crítico: reintento la próxima semana */ }
  }

  return NextResponse.json({ ok: true, empresas_con_backlog: porEmpresa.size, enviados })
}
