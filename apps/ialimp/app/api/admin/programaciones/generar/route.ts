import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  try {
    // Obtener todas las programaciones activas
    const programaciones = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT pg.*, p.nombre AS prop_nombre, p.cliente_id
      FROM programaciones pg
      JOIN propiedades p ON p.id = pg.propiedad_id
      WHERE pg.activa = true
        AND pg.fecha_inicio <= CURRENT_DATE
        AND (pg.fecha_fin IS NULL OR pg.fecha_fin >= CURRENT_DATE)
    `)

    let generadas = 0
    let omitidas  = 0

    for (const prog of programaciones) {
      const hoy    = new Date()
      const hasta  = new Date()
      hasta.setDate(hasta.getDate() + prog.dias_antelacion)

      const cur = new Date(hoy)
      while (cur <= hasta) {
        const diaSemana = cur.getDay() || 7
        const diaMes    = cur.getDate()
        const fechaStr  = cur.toISOString().split('T')[0]

        let incluir = false
        if (prog.frecuencia === 'semanal' && prog.dias_semana?.includes(diaSemana)) {
          incluir = true
        } else if (prog.frecuencia === 'mensual' && prog.dias_mes?.includes(diaMes)) {
          incluir = true
        } else if (prog.frecuencia === 'quincenal' && prog.dias_semana?.includes(diaSemana)) {
          const semana = Math.ceil(diaMes / 7)
          if (semana === 1 || semana === 3) incluir = true
        }

        if (incluir) {
          const extId = 'prog_' + prog.id + '_' + fechaStr
          const existe = await prisma.$queryRaw<any[]>(Prisma.sql`
            SELECT id FROM cleaning_sessions
            WHERE external_reservation_id = ${extId}
          `)

          if (!existe.length) {
            await prisma.$executeRaw(Prisma.sql`
              INSERT INTO cleaning_sessions (
                empresa_id, propiedad_id, cliente_id,
                property_name, session_date,
                hora_inicio, limpiadora_id, tipo_servicio,
                origen, external_reservation_id
              ) VALUES (
                ${prog.empresa_id}::uuid,
                ${prog.propiedad_id}::uuid,
                ${prog.cliente_id}::uuid,
                ${prog.prop_nombre},
                ${fechaStr}::date,
                ${prog.hora_inicio || null},
                ${prog.limpiadora_id ? prog.limpiadora_id + '::uuid' : null},
                ${prog.tipo_servicio},
                'programacion',
                ${extId}
              )
            `)
            generadas++
          } else {
            omitidas++
          }
        }
        cur.setDate(cur.getDate() + 1)
      }
    }

    return NextResponse.json({
      ok: true,
      programaciones: programaciones.length,
      generadas,
      omitidas
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
