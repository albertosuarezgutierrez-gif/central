import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { tgSend } from '@central/core-telegram'

const HORAS_DIA_MAX = 9
const HORAS_SEMANA_MAX = 40

// Vercel Cron: 30 20 * * * (cada día a las 20:30 UTC ≈ 22:30 hora española)
// Detecta empleados que han superado 9 h en la jornada de hoy o 40 h esta semana ISO.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Empleados con más de HORAS_DIA_MAX horas hoy (cerradas)
  const excesoDia = await prisma.$queryRaw<{ empresa_nombre: string; empleado_nombre: string; horas: number }[]>(
    Prisma.sql`
      SELECT
        emp.nombre AS empresa_nombre,
        e.nombre   AS empleado_nombre,
        SUM(f.horas_totales)::numeric(5,1) AS horas
      FROM rrhh.fichajes f
      JOIN rrhh.empresas emp ON emp.id = f.empresa_id
      JOIN rrhh.empleados e  ON e.id  = f.empleado_id
      WHERE f.estado = 'cerrado'
        AND (f.entrada_at AT TIME ZONE 'Europe/Madrid')::date = (now() AT TIME ZONE 'Europe/Madrid')::date
      GROUP BY emp.nombre, e.nombre
      HAVING SUM(f.horas_totales) > ${HORAS_DIA_MAX}
      ORDER BY horas DESC
    `
  )

  // Empleados con más de HORAS_SEMANA_MAX horas esta semana ISO (lunes–domingo)
  const excesoSemana = await prisma.$queryRaw<{ empresa_nombre: string; empleado_nombre: string; horas: number }[]>(
    Prisma.sql`
      SELECT
        emp.nombre AS empresa_nombre,
        e.nombre   AS empleado_nombre,
        SUM(f.horas_totales)::numeric(5,1) AS horas
      FROM rrhh.fichajes f
      JOIN rrhh.empresas emp ON emp.id = f.empresa_id
      JOIN rrhh.empleados e  ON e.id  = f.empleado_id
      WHERE f.estado = 'cerrado'
        AND date_trunc('week', f.entrada_at AT TIME ZONE 'Europe/Madrid') = date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')
      GROUP BY emp.nombre, e.nombre
      HAVING SUM(f.horas_totales) > ${HORAS_SEMANA_MAX}
      ORDER BY horas DESC
    `
  )

  if (!excesoDia.length && !excesoSemana.length) {
    return NextResponse.json({ ok: true, alertas: 0 })
  }

  const lineas: string[] = []

  if (excesoDia.length) {
    lineas.push(`<b>Exceso de jornada diaria (&gt;${HORAS_DIA_MAX} h):</b>`)
    for (const r of excesoDia) {
      lineas.push(`• <b>${r.empleado_nombre}</b> (${r.empresa_nombre}) — ${r.horas} h hoy`)
    }
  }

  if (excesoSemana.length) {
    if (lineas.length) lineas.push('')
    lineas.push(`<b>Exceso de jornada semanal (&gt;${HORAS_SEMANA_MAX} h):</b>`)
    for (const r of excesoSemana) {
      lineas.push(`• <b>${r.empleado_nombre}</b> (${r.empresa_nombre}) — ${r.horas} h esta semana`)
    }
  }

  await tgSend(`⚠️ <b>Alerta jornada máxima — rrhh</b>\n\n${lineas.join('\n')}\n\n<i>Revisa en /admin/fichajes. RD-ley 8/2019 limita 9 h/día y 40 h/semana ordinarias.</i>`, { html: true })

  return NextResponse.json({ ok: true, alertas: excesoDia.length + excesoSemana.length })
}
