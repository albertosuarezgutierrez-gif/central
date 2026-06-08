import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { aiComplete } from '@/lib/ai-client'

export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()

    const [quejas, carga, rendimiento] = await Promise.all([
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT q.categoria, p.nombre AS propiedad, p.duracion_estimada_min,
          EXTRACT(DOW FROM q.creada_at) AS dia_semana,
          cs.num_huespedes
        FROM quejas q
        LEFT JOIN propiedades p ON p.id = q.propiedad_id
        LEFT JOIN cleaning_sessions cs ON cs.id = q.sesion_id
        WHERE q.empresa_id = ${empresa_id}::uuid
        ORDER BY q.creada_at DESC LIMIT 50
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT session_date::text, COUNT(*) AS limpiezas FROM cleaning_sessions
        WHERE empresa_id = ${empresa_id}::uuid AND session_date >= CURRENT_DATE - 60
        GROUP BY session_date ORDER BY session_date
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT * FROM rendimiento_limpiadoras WHERE empresa_id = ${empresa_id}::uuid
      `)
    ])

    const listaQuejas  = quejas.map((q: any) => q.propiedad + '(' + q.num_huespedes + ' huésp, día ' + q.dia_semana + ')').join(', ')
    const listaCarga   = carga.map((c: any) => c.session_date + ':' + c.limpiezas).join(', ')
    const listaRend    = rendimiento.map((r: any) => r.limpiadora_nombre + '(rating:' + (r.rating_medio||'?') + ',quejas:' + r.quejas_mes + ')').join(', ')

    const prompt = 'Eres analista de datos de una empresa de limpieza profesional española. ' +
      'Analiza estos datos y detecta patrones, anomalías y predicciones.\n\n' +
      'QUEJAS RECIENTES (propiedad, huéspedes, día semana): ' + (listaQuejas || 'ninguna') + '\n' +
      'CARGA DIARIA (últimos 60 días): ' + (listaCarga || 'sin datos') + '\n' +
      'RENDIMIENTO LIMPIADORAS: ' + (listaRend || 'sin datos') + '\n\n' +
      'Responde SOLO con JSON (sin markdown):\n' +
      '{"patrones":[{"titulo":"...","descripcion":"...","tipo":"calidad|carga|rendimiento","urgencia":"alta|media|baja"}],' +
      '"predicciones":[{"semana":"...","limpiezas_estimadas":0,"alerta":"..."}],' +
      '"acciones_recomendadas":["...","..."]}'

    const resp = await aiComplete(prompt)
    let analisis: any = { patrones: [], predicciones: [], acciones_recomendadas: [] }
    try {
      analisis = JSON.parse(resp.replace(/```json|```/g, '').trim())
    } catch {}

    return NextResponse.json({ ok: true, analisis })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
