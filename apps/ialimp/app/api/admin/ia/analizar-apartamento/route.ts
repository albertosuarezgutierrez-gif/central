import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { aiComplete } from '@/lib/ai-client'
import { serialize } from '@/lib/serialize'

export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { propiedad_id } = await req.json()

    const [propiedad, sesiones, quejas, checklist] = await Promise.all([
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT nombre, tipo, m2, habitaciones, num_huespedes_max,
          duracion_estimada_min, modelo_precio, notas
        FROM propiedades
        WHERE id = ${propiedad_id}::uuid AND empresa_id = ${empresa_id}::uuid
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT
          session_date::text,
          tipo_servicio,
          limpiadora_id,
          CASE WHEN completed_at IS NOT NULL THEN 'completada' ELSE 'pendiente' END AS estado,
          EXTRACT(DOW FROM session_date::date) AS dia_semana,
          EXTRACT(EPOCH FROM (completed_at - (session_date::date + hora_inicio::time)))/60 AS duracion_real_min,
          urgente_manual
        FROM cleaning_sessions
        WHERE propiedad_id = ${propiedad_id}::uuid
          AND empresa_id = ${empresa_id}::uuid
          AND session_date >= CURRENT_DATE - 90
        ORDER BY session_date DESC
        LIMIT 60
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT descripcion, categoria, estado, creada_at::text
        FROM quejas
        WHERE propiedad_id = ${propiedad_id}::uuid
          AND empresa_id = ${empresa_id}::uuid
        ORDER BY creada_at DESC
        LIMIT 20
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT sc.item_description, sc.checked,
          (sc.photo_url IS NOT NULL OR sc.photo_url_2 IS NOT NULL) AS tiene_foto
        FROM session_completions sc
        JOIN cleaning_sessions cs ON cs.id = sc.session_id
        WHERE cs.propiedad_id = ${propiedad_id}::uuid
          AND cs.empresa_id = ${empresa_id}::uuid
          AND cs.completed_at IS NOT NULL
          AND cs.session_date >= CURRENT_DATE - 90
        ORDER BY cs.completed_at DESC
        LIMIT 100
      `)
    ])

    if (!propiedad.length) {
      return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 })
    }

    const p = propiedad[0]
    const total = sesiones.length
    const completadas = sesiones.filter((s: any) => s.estado === 'completada').length
    const urgentes = sesiones.filter((s: any) => s.urgente_manual).length
    const duraciones = sesiones
      .filter((s: any) => s.duracion_real_min && s.duracion_real_min > 0)
      .map((s: any) => Number(s.duracion_real_min))
    const duracionMedia = duraciones.length
      ? Math.round(duraciones.reduce((a: number, b: number) => a + b, 0) / duraciones.length)
      : null

    const diasSemana: Record<number, number> = {}
    sesiones.forEach((s: any) => {
      const d = Number(s.dia_semana)
      diasSemana[d] = (diasSemana[d] || 0) + 1
    })
    const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    const patronDias = (Object.entries(diasSemana) as [string, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([d, n]) => DIAS[Number(d)] + ':' + n)
      .join(', ')

    const itemsFallo = checklist
      .filter((c: any) => !c.checked)
      .reduce((acc: Record<string, number>, c: any) => {
        acc[c.item_description] = (acc[c.item_description] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    const topFallos = (Object.entries(itemsFallo) as Array<[string, number]>)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([item, n]) => item + '(' + n + 'x)')
      .join(', ')

    const listaQuejas = quejas.length
      ? quejas.map((q: any) => '[' + q.categoria + '] ' + q.descripcion + ' → ' + q.estado).join('\n')
      : 'Sin quejas'

    const prompt =
      'Eres analista de operaciones de una empresa de limpieza profesional española. ' +
      'Analiza los datos de la siguiente propiedad y genera un informe breve en español.\n\n' +
      'PROPIEDAD: ' + p.nombre + ' (' + (p.tipo || 'piso_turistico') + ')' +
      (p.m2 ? ', ' + p.m2 + 'm²' : '') +
      (p.habitaciones ? ', ' + p.habitaciones + ' hab' : '') +
      (p.num_huespedes_max ? ', máx ' + p.num_huespedes_max + ' huésp' : '') + '\n' +
      'NOTAS DE LA PROPIEDAD: ' + (p.notas || 'ninguna') + '\n\n' +
      'SESIONES (últimos 90 días):\n' +
      '- Total: ' + total + ' · Completadas: ' + completadas + '/' + total +
      (duracionMedia ? ' · Duración media real: ' + duracionMedia + ' min (estimada: ' + (p.duracion_estimada_min || '?') + ' min)' : '') +
      (urgentes ? ' · Urgentes: ' + urgentes : '') + '\n' +
      '- Días más frecuentes: ' + (patronDias || 'sin datos') + '\n\n' +
      'QUEJAS RECIENTES:\n' + listaQuejas + '\n\n' +
      (topFallos ? 'ÍTEMS DE CHECKLIST MÁS FALLADOS: ' + topFallos + '\n\n' : '') +
      'Responde SOLO con JSON (sin markdown):\n' +
      '{"resumen":"...","metricas":{"tasa_completado":"X%","incidencias_total":0,"duracion_real_vs_estimada":"..."},' +
      '"alertas":[{"titulo":"...","descripcion":"..."}],' +
      '"insights":[{"titulo":"...","descripcion":"..."}],' +
      '"recomendaciones":[{"titulo":"...","descripcion":"..."}]}'

    const respuesta = await aiComplete(prompt)
    let analisis: any = { resumen: '', metricas: {}, alertas: [], insights: [], recomendaciones: [] }
    try {
      analisis = JSON.parse(respuesta.replace(/```json|```/g, '').trim())
    } catch {
      analisis.resumen = respuesta.slice(0, 400)
    }

    return NextResponse.json(serialize({
      ok: true,
      analisis,
      propiedad: p.nombre,
      stats: { total, completadas, urgentes, duracionMedia }
    }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
