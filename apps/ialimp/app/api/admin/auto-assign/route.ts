import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { aiComplete } from '@/lib/ai-client'
import { sendPushToLimpiadora } from '@/lib/push'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── Helpers ───────────────────────────────────────────────────────────────

async function generarJustificacion(
  limpiadora: string,
  propiedad: string,
  hora: string | null,
  conocePropiedad: boolean,
  cargaMin: number
): Promise<string> {
  try {
    const motivo = conocePropiedad
      ? 'conoce la propiedad'
      : cargaMin === 0
        ? 'sin carga asignada hoy'
        : 'menor carga del equipo'

    const prompt = `Eres el coordinador de una empresa de limpieza profesional.
Explica en UNA frase (máximo 60 caracteres, sin puntos finales) por qué se asignó esta limpiadora a esta sesión.
Sé muy conciso y directo.
Ejemplos válidos: "Conoce el piso y tiene hueco libre", "Sin carga asignada hoy", "Menor carga del equipo esta semana"
Datos: limpiadora="${limpiadora}", propiedad="${propiedad}", hora="${hora || 'sin hora'}", motivo_principal="${motivo}"
Responde SOLO la frase, sin comillas.`

    const respuesta = await aiComplete(prompt)
    return respuesta.trim().slice(0, 80)
  } catch (_) {
    return conocePropiedad ? 'Conoce la propiedad' : 'Menor carga del equipo'
  }
}

// ─── Cron principal ────────────────────────────────────────────────────────

export async function GET() {
  try {
    const hoy = new Date().toISOString().split('T')[0]
    const manana = new Date(Date.now() + 86400000).toISOString().split('T')[0]

    // Sesiones de hoy y mañana sin limpiadora asignada
    const sinAsignar = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        cs.id, cs.empresa_id,
        -- property_id convive en 2 formatos (slug/UUID); ambos a text para evitar
        -- el choque de tipos en COALESCE (text vs uuid)
        COALESCE(NULLIF(cs.propiedad_id::text, ''), cs.property_id::text) AS propiedad_id,
        cs.property_name,
        cs.session_date, cs.hora_inicio, cs.tipo_servicio,
        cs.tiempo_estimado
      FROM cleaning_sessions cs
      WHERE cs.session_date IN (${hoy}::date, ${manana}::date)
        AND cs.limpiadora_id IS NULL
      ORDER BY cs.session_date ASC, cs.hora_inicio ASC NULLS LAST
    `)

    if (!sinAsignar.length) {
      return NextResponse.json({ ok: true, asignadas: 0, msg: 'Sin sesiones pendientes' })
    }

    const resultados: any[] = []

    for (const sesion of sinAsignar) {
      const fecha = sesion.session_date instanceof Date
        ? sesion.session_date.toISOString().split('T')[0]
        : String(sesion.session_date).split('T')[0]

      const d = new Date(fecha + 'T12:00:00')
      const diaSemana = d.getDay() === 0 ? 7 : d.getDay()
      const propiedadId = sesion.propiedad_id || ''
      const horaSesion  = sesion.hora_inicio || null   // hora_inicio es TEXT; null = sin hora
      const estimadoMin = sesion.tiempo_estimado || 120

      // Candidatas + señales: ventana horaria, tope de jornada, conoce el piso,
      // carga del DÍA y carga de la SEMANA (lun-dom). Todo scopeado por empresa.
      const candidatas = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT
          l.id,
          l.nombre,
          l.color,
          l.propiedades,
          l.empresa_id,
          ld.hora_inicio,
          ld.hora_fin,
          COALESCE(carga_dia.total_min, 0)::int AS carga_dia_min,
          COALESCE(carga_sem.total_min, 0)::int AS carga_sem_min,
          -- ¿cabe en su jornada del día? (carga actual + esta sesión ≤ horas_max)
          (COALESCE(carga_dia.total_min, 0) + ${estimadoMin} <= COALESCE(ld.horas_max, 8) * 60) AS cabe_jornada,
          -- ¿la hora de la sesión cae en su turno? (sin hora = sí)
          (
            ${horaSesion}::time IS NULL
            OR ld.hora_inicio IS NULL
            OR ${horaSesion}::time BETWEEN ld.hora_inicio AND ld.hora_fin
          ) AS dentro_ventana,
          CASE
            WHEN ${propiedadId} != '' AND ${propiedadId} = ANY(l.propiedades::text[]) THEN true
            ELSE false
          END AS conoce_propiedad
        FROM limpiadoras l
        JOIN (
          SELECT limpiadora_id,
                 MIN(hora_inicio) AS hora_inicio,
                 MAX(hora_fin)    AS hora_fin,
                 MAX(horas_max)   AS horas_max
          FROM limpiadora_disponibilidad
          WHERE dia_semana = ${diaSemana} AND activo = true
          GROUP BY limpiadora_id
        ) ld ON ld.limpiadora_id = l.id
        LEFT JOIN (
          SELECT limpiadora_id, SUM(COALESCE(tiempo_estimado, 120)) AS total_min
          FROM cleaning_sessions
          WHERE session_date = ${fecha}::date
            AND limpiadora_id IS NOT NULL
            AND empresa_id = ${sesion.empresa_id}::uuid
          GROUP BY limpiadora_id
        ) carga_dia ON carga_dia.limpiadora_id = l.id
        LEFT JOIN (
          SELECT limpiadora_id, SUM(COALESCE(tiempo_estimado, 120)) AS total_min
          FROM cleaning_sessions
          WHERE session_date BETWEEN date_trunc('week', ${fecha}::date)::date
                                 AND (date_trunc('week', ${fecha}::date)::date + 6)
            AND limpiadora_id IS NOT NULL
            AND empresa_id = ${sesion.empresa_id}::uuid
          GROUP BY limpiadora_id
        ) carga_sem ON carga_sem.limpiadora_id = l.id
        WHERE l.activa = true
          AND l.empresa_id = ${sesion.empresa_id}::uuid
          AND NOT EXISTS (
            SELECT 1 FROM limpiadora_ausencias a
            WHERE a.limpiadora_id = l.id
              AND ${fecha}::date BETWEEN a.fecha_inicio AND a.fecha_fin
              AND a.aprobada = true
          )
      `)

      if (!candidatas.length) {
        resultados.push({
          sesion_id: sesion.id,
          propiedad: sesion.property_name,
          fecha,
          asignada: false,
          motivo: 'Sin limpiadoras disponibles'
        })
        continue
      }

      // Scoring (pesos tuneables). Prioridad: ventana horaria ≫ tope de jornada ≫
      // conoce el piso; y, a igualdad, EQUIDAD por carga semanal (desempate: carga del día).
      // Ventana y jornada penalizan fuerte pero NO excluyen: si nadie cumple, se asigna
      // igualmente al mejor (mejor asignar que dejar la sesión huérfana).
      const mejorCandidataScore = candidatas.map(c => {
        const cargaSemH = (c.carga_sem_min || 0) / 60
        const cargaDiaH = (c.carga_dia_min || 0) / 60
        const score =
          (c.dentro_ventana   ? 1000 : 0) +   // cae en su turno
          (c.cabe_jornada     ? 300  : 0) +   // respeta el tope de horas del día
          (c.conoce_propiedad ? 40   : 0) +   // conoce la propiedad
          (-cargaSemH * 5) +                  // menos carga semanal = más score (equidad)
          (-cargaDiaH * 1)                    // desempate por carga del día
        return { ...c, score }
      }).sort((a, b) => b.score - a.score)[0]

      // Generar justificación IA
      const justificacion = await generarJustificacion(
        mejorCandidataScore.nombre,
        sesion.property_name,
        sesion.hora_inicio,
        mejorCandidataScore.conoce_propiedad,
        mejorCandidataScore.carga_dia_min
      )

      // Asignar en BD
      await prisma.$executeRaw(Prisma.sql`
        UPDATE cleaning_sessions
        SET
          limpiadora_id   = ${mejorCandidataScore.id}::uuid,
          notas_internas  = ${`[Auto-asignado] ${justificacion}`}
        WHERE id = ${sesion.id}::uuid
      `)

      // Crear alerta de asignación
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO alertas (empresa_id, tipo, titulo, descripcion, leida)
        VALUES (
          ${sesion.empresa_id}::uuid,
          'asignacion_auto',
          ${`Auto-asign: ${mejorCandidataScore.nombre} → ${sesion.property_name}`},
          ${`${fecha} · ${justificacion}`},
          false
        )
      `)

      // Push notification a la limpiadora asignada
      const horaTexto = sesion.hora_inicio
        ? String(sesion.hora_inicio).slice(0, 5)
        : 'sin hora'

      await sendPushToLimpiadora(
        mejorCandidataScore.empresa_id,
        mejorCandidataScore.id,
        '🧹 Nueva sesión asignada',
        `${sesion.property_name} · ${fecha === hoy ? 'Hoy' : 'Mañana'} ${horaTexto} · ${justificacion}`
      )

      resultados.push({
        sesion_id: sesion.id,
        propiedad: sesion.property_name,
        fecha,
        asignada: true,
        limpiadora: mejorCandidataScore.nombre,
        score: mejorCandidataScore.score,
        justificacion
      })
    }

    const asignadas = resultados.filter(r => r.asignada).length
    const fallidas  = resultados.filter(r => !r.asignada).length

    return NextResponse.json({
      ok: true,
      fecha_ejecucion: new Date().toISOString(),
      sesiones_procesadas: sinAsignar.length,
      asignadas,
      fallidas,
      detalle: resultados
    })

  } catch (e: any) {
    console.error('[auto-assign] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
