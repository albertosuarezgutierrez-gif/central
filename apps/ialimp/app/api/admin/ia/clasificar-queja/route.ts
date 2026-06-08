import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { aiComplete } from '@/lib/ai-client'

// POST /api/admin/ia/clasificar-queja
// Body: { queja_id } — clasifica y enriquece una queja existente
// También llamado automáticamente desde POST /api/admin/quejas al crear una nueva
export async function POST(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { queja_id } = await req.json()
    if (!queja_id) return NextResponse.json({ error: 'queja_id requerido' }, { status: 400 })

    // Obtener queja con contexto
    const quejas = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT q.*,
        l.nombre AS limpiadora_nombre,
        p.nombre AS propiedad_nombre,
        cs.session_date,
        -- Historial de quejas de esta limpiadora (últimos 90 días)
        (SELECT COUNT(*) FROM quejas q2
         WHERE q2.limpiadora_id = q.limpiadora_id
           AND q2.empresa_id = ${empresa_id}::uuid
           AND q2.creada_at > NOW() - INTERVAL '90 days'
           AND q2.id != q.id) AS quejas_limpiadora_90d,
        -- Quejas anteriores de esta propiedad
        (SELECT COUNT(*) FROM quejas q3
         WHERE q3.propiedad_id = q.propiedad_id
           AND q3.empresa_id = ${empresa_id}::uuid
           AND q3.id != q.id) AS quejas_propiedad_total
      FROM quejas q
      LEFT JOIN limpiadoras l ON l.id = q.limpiadora_id
      LEFT JOIN propiedades  p ON p.id = q.propiedad_id
      LEFT JOIN cleaning_sessions cs ON cs.id = q.sesion_id
      WHERE q.id = ${queja_id}::uuid
        AND q.empresa_id = ${empresa_id}::uuid
    `)

    if (!quejas.length) return NextResponse.json({ error: 'Queja no encontrada' }, { status: 404 })
    const q = quejas[0]

    const prompt = `Eres el responsable de calidad de una empresa de limpieza profesional española.
Analiza esta incidencia y responde ÚNICAMENTE con JSON válido, sin markdown ni texto extra:
{
  "categoria": "limpieza|rotura|actitud|retraso|olvido|comunicacion|otro",
  "severidad": "baja|media|alta",
  "afecta_expediente_rrhh": boolean,
  "respuesta_propietario": "texto de disculpa/explicación para enviar al propietario, máx 100 chars, tono profesional",
  "accion_recomendada": "qué debe hacer la coordinadora ahora mismo, máx 80 chars",
  "patron_detectado": boolean
}

Datos de la incidencia:
- Descripción: "${q.descripcion}"
- Categoría actual: "${q.categoria || 'sin categorizar'}"
- Limpiadora: ${q.limpiadora_nombre || 'no asignada'} (${q.quejas_limpiadora_90d} quejas en 90 días)
- Propiedad: ${q.propiedad_nombre || 'desconocida'} (${q.quejas_propiedad_total} quejas históricas)
- Reportada por: ${q.reportada_por || 'desconocido'}
- Origen: ${q.origen || 'manual'}

Criterios para afecta_expediente_rrhh=true: descripción de actitud, ${q.quejas_limpiadora_90d} quejas de esta misma limpiadora en 90 días son 3 o más, o severidad alta por comportamiento.
Criterios para patron_detectado=true: ${q.quejas_propiedad_total} quejas en esta propiedad son 3 o más, o la limpiadora tiene 2+ quejas recientes.`

    let clasificacion: any = null
    try {
      const raw = await aiComplete(prompt)
      const clean = raw.replace(/```json|```/g, '').trim()
      clasificacion = JSON.parse(clean)
    } catch (_) {
      // Fallback basado en palabras clave
      const desc = (q.descripcion || '').toLowerCase()
      clasificacion = {
        categoria: desc.includes('sucio') || desc.includes('limpi') ? 'limpieza'
          : desc.includes('roto') || desc.includes('rotura') ? 'rotura'
          : desc.includes('tarde') || desc.includes('retraso') ? 'retraso'
          : desc.includes('actitud') || desc.includes('grosero') ? 'actitud'
          : 'otro',
        severidad: q.severidad || 'baja',
        afecta_expediente_rrhh: Number(q.quejas_limpiadora_90d) >= 3,
        respuesta_propietario: 'Lamentamos la incidencia. Ya estamos tomando medidas para que no vuelva a ocurrir.',
        accion_recomendada: 'Contactar con el propietario y revisar la sesión.',
        patron_detectado: Number(q.quejas_propiedad_total) >= 3 || Number(q.quejas_limpiadora_90d) >= 2
      }
    }

    // Actualizar queja con clasificación IA
    await prisma.$executeRaw(Prisma.sql`
      UPDATE quejas SET
        categoria         = ${clasificacion.categoria},
        severidad         = ${clasificacion.severidad},
        notas_resolucion  = COALESCE(notas_resolucion, ${clasificacion.accion_recomendada})
      WHERE id = ${queja_id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)

    // Si afecta expediente RRHH y hay limpiadora → crear aviso en expedientes
    if (clasificacion.afecta_expediente_rrhh && q.limpiadora_id) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO expedientes_rrhh (empresa_id, limpiadora_id, tipo, titulo, descripcion, generado_por_ia)
        VALUES (
          ${empresa_id}::uuid,
          ${q.limpiadora_id}::uuid,
          'incidencia_calidad',
          ${`Queja: ${clasificacion.categoria} (${clasificacion.severidad})`},
          ${`[IA] ${q.descripcion?.slice(0, 150) || ''} · Acción: ${clasificacion.accion_recomendada}`},
          true
        )
      `)
    }

    // Crear alerta si patrón detectado o severidad alta
    if (clasificacion.patron_detectado || clasificacion.severidad === 'alta') {
      const emoji = clasificacion.severidad === 'alta' ? '🚨' : '⚠️'
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO alertas (empresa_id, tipo, titulo, descripcion, leida)
        VALUES (
          ${empresa_id}::uuid,
          'patron_quejas',
          ${`${emoji} Patrón detectado: ${q.propiedad_nombre || q.limpiadora_nombre || 'incidencia'}`},
          ${`${clasificacion.categoria} · ${clasificacion.accion_recomendada}`},
          false
        )
      `)
    }

    return NextResponse.json({
      ok: true,
      queja_id,
      clasificacion,
      expediente_creado: clasificacion.afecta_expediente_rrhh && !!q.limpiadora_id,
      alerta_creada: clasificacion.patron_detectado || clasificacion.severidad === 'alta'
    })

  } catch (e: any) {
    console.error('[clasificar-queja] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
