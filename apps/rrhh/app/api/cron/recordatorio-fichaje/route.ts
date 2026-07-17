import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { pushEmpleado } from '@/lib/push'

// Vercel Cron: 0 7 * * 1-5 (lunes a viernes a las 7:00 UTC ≈ 9:00 hora española)
// Envía una notificación push a los empleados que aún no han fichado hoy.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Empleados con suscripción push activa que NO han fichado entrada hoy
  const pendientes = await prisma.$queryRaw<{ empresa_id: string; suscriptor_id: string }[]>(
    Prisma.sql`
      SELECT DISTINCT ps.empresa_id, ps.suscriptor_id
      FROM rrhh.push_subscriptions ps
      WHERE ps.suscriptor_tipo = 'titular'
        AND NOT EXISTS (
          SELECT 1 FROM rrhh.fichajes f
          WHERE f.empresa_id = ps.empresa_id
            AND f.empleado_id = ps.suscriptor_id
            AND f.entrada_at::date = CURRENT_DATE
        )
    `
  )

  let enviados = 0
  for (const { empresa_id, suscriptor_id } of pendientes) {
    await pushEmpleado(empresa_id, suscriptor_id, '⏰ Recordatorio de fichaje', 'No olvides registrar tu entrada de hoy.', '/e')
    enviados++
  }

  return NextResponse.json({ ok: true, enviados })
}
