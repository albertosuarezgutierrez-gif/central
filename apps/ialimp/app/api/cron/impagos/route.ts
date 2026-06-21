// /api/cron/impagos — Agente de impagos (diario).
// Detecta facturas a clientes vencidas y no cobradas, envía recordatorios
// escalonados (+3/+10/+21 días) al cliente sin repetir escalón (histórico en
// recordatorios_impagos), y manda a cada empresa un resumen diario de sus impagos.
// Auth: Bearer CRON_SECRET (o ?secret= para disparo manual). Degrada limpio sin SMTP.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'
import { emailFacturacionCliente } from '@/lib/facturacion'
import {
  diasVencida, escalonAEnviar, textoRecordatorio, resumenEmpresaTexto, type FacturaImpago,
} from '@/lib/impagos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Row = {
  id: string; numero_factura: string; cliente_id: string; empresa_id: string
  fecha_vencimiento: string; total: number
  cliente_nombre: string; email_facturacion: string | null; notif_email: string | null; contacto_email: string | null
  empresa_nombre: string; empresa_email: string
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const ok = !!secret && (auth === `Bearer ${secret}` || req.nextUrl.searchParams.get('secret') === secret)
  if (!ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }) // YYYY-MM-DD

  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT f.id, f.numero_factura, f.cliente_id, f.empresa_id,
           to_char(f.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
           COALESCE(f.total, f.base_imponible + COALESCE(f.iva_importe, 0))::float AS total,
           c.nombre AS cliente_nombre, c.email_facturacion, c.notif_email, c.contacto_email,
           e.nombre AS empresa_nombre, e.email AS empresa_email
    FROM facturas_clientes f
    JOIN clientes c ON c.id = f.cliente_id
    JOIN empresas e ON e.id = f.empresa_id
    WHERE f.estado IN ('emitida', 'vencida')
      AND f.fecha_vencimiento IS NOT NULL
      AND f.fecha_vencimiento < ${hoy}::date
      AND f.fecha_cobro IS NULL
      AND f.pagada_online_at IS NULL
  `)

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, hoy, impagos: 0, enviados: 0, empresas_avisadas: 0 })
  }

  // Recordatorios ya enviados por factura (para no repetir escalón).
  const ids = rows.map(r => r.id)
  const previos = await prisma.$queryRaw<{ factura_id: string; escalon: number }[]>(Prisma.sql`
    SELECT factura_id, escalon FROM recordatorios_impagos WHERE factura_id IN (${Prisma.join(ids)})
  `)
  const enviadosPorFactura = new Map<string, number[]>()
  for (const p of previos) {
    const arr = enviadosPorFactura.get(p.factura_id) ?? []
    arr.push(p.escalon)
    enviadosPorFactura.set(p.factura_id, arr)
  }

  const transporter = getTransporter()
  const porEmpresa = new Map<string, { nombre: string; email: string; items: FacturaImpago[] }>()
  let enviados = 0

  for (const r of rows) {
    const f: FacturaImpago = {
      numero_factura: r.numero_factura, cliente_nombre: r.cliente_nombre,
      total: r.total, fecha_vencimiento: r.fecha_vencimiento,
    }
    const grupo = porEmpresa.get(r.empresa_id) ?? { nombre: r.empresa_nombre, email: r.empresa_email, items: [] }
    grupo.items.push(f)
    porEmpresa.set(r.empresa_id, grupo)

    const escalon = escalonAEnviar(diasVencida(r.fecha_vencimiento, hoy), enviadosPorFactura.get(r.id) ?? [])
    if (!escalon || !transporter) continue

    const email = await emailFacturacionCliente(r.empresa_id, {
      id: r.cliente_id, email_facturacion: r.email_facturacion,
      notif_email: r.notif_email, contacto_email: r.contacto_email,
    })
    if (!email) continue // sin email → no se registra; se reintentará cuando lo tenga

    const { asunto, texto } = textoRecordatorio(r.empresa_nombre, f, escalon)
    try {
      await transporter.sendMail({ from: `${r.empresa_nombre} <${MAIL_FROM}>`, to: email, subject: asunto, text: texto })
    } catch {
      continue // si falla el envío, no registrar → reintento en la próxima pasada
    }
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO recordatorios_impagos (empresa_id, factura_id, cliente_id, escalon, email_destino)
      VALUES (${r.empresa_id}::uuid, ${r.id}::uuid, ${r.cliente_id}::uuid, ${escalon}, ${email})
      ON CONFLICT (factura_id, escalon) DO NOTHING
    `)
    enviados++
  }

  // Resumen diario a cada empresa con impagos.
  let empresasAvisadas = 0
  if (transporter) {
    for (const [, g] of porEmpresa) {
      if (!g.email || g.items.length === 0) continue
      const { asunto, texto } = resumenEmpresaTexto(g.nombre, g.items)
      try {
        await transporter.sendMail({ from: `${g.nombre} <${MAIL_FROM}>`, to: g.email, subject: asunto, text: texto })
        empresasAvisadas++
      } catch { /* no crítico */ }
    }
  }

  return NextResponse.json({ ok: true, hoy, impagos: rows.length, enviados, empresas_avisadas: empresasAvisadas })
}
