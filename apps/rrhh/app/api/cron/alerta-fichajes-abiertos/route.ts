import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { tgSend } from '@central/core-telegram'

const HORAS_LIMITE = 10

// Vercel Cron: 0 20 * * * (cada día a las 20:00 UTC ≈ 22:00 hora española)
// Detecta fichajes activos con más de HORAS_LIMITE horas sin fichar salida y avisa por Telegram.
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET || ''}`) {
    const ua = req.headers.get('user-agent') ?? ''
    if (!ua.includes('vercel-cron')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const abiertos = await prisma.$queryRaw<{ empresa_nombre: string; empleado_nombre: string; entrada_at: string; obra_nombre: string | null; horas: number }[]>(
    Prisma.sql`
      SELECT
        emp.nombre AS empresa_nombre,
        e.nombre   AS empleado_nombre,
        f.entrada_at,
        o.nombre   AS obra_nombre,
        ROUND(EXTRACT(EPOCH FROM (now() - f.entrada_at)) / 3600.0, 1) AS horas
      FROM rrhh.fichajes f
      JOIN rrhh.empresas emp ON emp.id = f.empresa_id
      JOIN rrhh.empleados e  ON e.id  = f.empleado_id
      LEFT JOIN rrhh.obras o ON o.id  = f.obra_id
      WHERE f.estado = 'activo'
        AND f.entrada_at < now() - (${HORAS_LIMITE} || ' hours')::interval
      ORDER BY horas DESC
    `
  )

  if (!abiertos.length) return NextResponse.json({ ok: true, alertas: 0 })

  const lineas = abiertos.map(r => {
    const hora = new Date(r.entrada_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
    return `• <b>${r.empleado_nombre}</b> (${r.empresa_nombre}) — ${r.horas} h sin salida, entró ${hora}${r.obra_nombre ? `, obra: ${r.obra_nombre}` : ''}`
  }).join('\n')

  await tgSend(`⚠️ <b>Fichajes sin cerrar — rrhh</b>\n\n${lineas}\n\n<i>Revisa en /admin/fichajes y corrige manualmente si es necesario.</i>`, { html: true })

  return NextResponse.json({ ok: true, alertas: abiertos.length })
}
