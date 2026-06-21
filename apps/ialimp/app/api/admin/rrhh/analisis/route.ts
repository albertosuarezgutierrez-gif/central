import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { aiComplete } from '@/lib/ai-client'
import { serialize } from '@/lib/serialize'

export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { limpiadora_id } = await req.json()

    const [rendimiento, quejas, sesiones, expedientes] = await Promise.all([
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT * FROM rendimiento_limpiadoras
        WHERE limpiadora_id = ${limpiadora_id}::uuid AND empresa_id = ${empresa_id}::uuid
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT q.descripcion, q.categoria, q.estado, q.creada_at, p.nombre AS propiedad
        FROM quejas q LEFT JOIN propiedades p ON p.id = q.propiedad_id
        WHERE q.limpiadora_id = ${limpiadora_id}::uuid AND q.empresa_id = ${empresa_id}::uuid
        ORDER BY q.creada_at DESC LIMIT 20
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT session_date, property_name, tipo_servicio,
          CASE WHEN completed_at IS NOT NULL THEN 'completada' ELSE 'pendiente' END AS estado
        FROM cleaning_sessions
        WHERE limpiadora_id = ${limpiadora_id}::uuid AND session_date >= CURRENT_DATE - 60
        ORDER BY session_date DESC LIMIT 30
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT tipo, titulo, descripcion, creada_at FROM expedientes_rrhh
        WHERE limpiadora_id = ${limpiadora_id}::uuid AND empresa_id = ${empresa_id}::uuid
        ORDER BY creada_at DESC LIMIT 10
      `)
    ])

    if (!rendimiento.length) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
    const r = rendimiento[0]

    // Construir listas de texto ANTES del template literal para evitar anidamiento
    const listaQuejas = quejas.length > 0
      ? quejas.map((q: any) => '- [' + q.categoria + '] ' + q.descripcion + ' → ' + q.estado + ' (' + (q.propiedad || 'prop. desconocida') + ')').join('\n')
      : 'Sin quejas'

    const listaSesiones = sesiones.length > 0
      ? sesiones.map((s: any) => '- ' + s.session_date + ': ' + s.property_name + ' [' + s.tipo_servicio + '] → ' + s.estado).join('\n')
      : 'Sin sesiones'

    const listaExpedientes = expedientes.length > 0
      ? expedientes.map((e: any) => '- [' + e.tipo + '] ' + e.titulo).join('\n')
      : 'Sin expediente previo'

    const prompt = 'Eres el sistema de RRHH de una empresa de limpieza profesional española. ' +
      'Analiza el rendimiento de esta limpiadora y proporciona un informe profesional en español.\n\n' +
      'DATOS:\n' +
      '- Nombre: ' + r.limpiadora_nombre + '\n' +
      '- Total sesiones: ' + r.total_sesiones + ' (' + r.sesiones_mes + ' último mes)\n' +
      '- Rating medio: ' + (r.rating_medio || 'Sin rating') + ' este mes: ' + (r.rating_mes || 'Sin datos') + '\n' +
      '- Quejas totales: ' + r.total_quejas + ' (' + r.quejas_mes + ' este mes, ' + r.quejas_pendientes + ' pendientes)\n\n' +
      'QUEJAS RECIENTES:\n' + listaQuejas + '\n\n' +
      'ÚLTIMAS SESIONES (60 días):\n' + listaSesiones + '\n\n' +
      'EXPEDIENTE PREVIO:\n' + listaExpedientes + '\n\n' +
      'Responde SOLO con un objeto JSON (sin markdown):\n' +
      '{"resumen":"...","puntos_fuertes":["..."],"areas_mejora":["..."],"alertas":["..."],"recomendacion_tipo":"positiva|neutral|atencion|urgente","sugerencia_accion":"...","documento_sugerido":"aviso|amonestacion|felicitacion|formacion|ninguno"}'

    const respuesta = await aiComplete(prompt)
    let analisis: any = {}
    try {
      const clean = respuesta.replace(/```json|```/g, '').trim()
      analisis = JSON.parse(clean)
    } catch {
      analisis = {
        resumen: respuesta.slice(0, 300),
        puntos_fuertes: [], areas_mejora: [], alertas: [],
        recomendacion_tipo: 'neutral', sugerencia_accion: '', documento_sugerido: 'ninguno'
      }
    }

    // Guardar como expediente
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO expedientes_rrhh (empresa_id, limpiadora_id, tipo, titulo, descripcion, generado_por_ia, periodo)
      VALUES (
        ${empresa_id}::uuid, ${limpiadora_id}::uuid, 'nota',
        ${'Análisis IA — ' + new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })},
        ${analisis.resumen || ''}, true,
        ${new Date().toISOString().slice(0, 7)}
      )
    `)

    return NextResponse.json(serialize({ ok: true, analisis, rendimiento: r }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
