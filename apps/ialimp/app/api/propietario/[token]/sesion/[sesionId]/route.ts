
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

async function getCliente(token: string) {
  const r = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, nombre, empresa_id,
           COALESCE(chat_config, '{"ver_checklist":false,"ver_fotos":false}'::jsonb) AS chat_config
    FROM clientes WHERE access_token = ${token} LIMIT 1
  `)
  return r[0] || null
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string; sesionId: string }> }
) {
  try {
    const { token, sesionId } = await params
    const cliente = await getCliente(token)
    if (!cliente) return NextResponse.json({ error: 'Token inválido' }, { status: 403 })

    const cfg = cliente.chat_config as any
    const puedeChecklist = cfg?.ver_checklist === true
    const puedeFotos     = cfg?.ver_fotos     === true

    // Datos básicos de la sesión
    const sesiones = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT cs.id::text, cs.session_date::text, cs.property_name,
             cs.started_at, cs.completed_at, cs.notes AS incidencias,
             cs.foto_antes_url, cs.foto_despues_url,
             cs.propiedad_id,
             l.nombre AS limpiadora_nombre
      FROM cleaning_sessions cs
      LEFT JOIN limpiadoras l ON l.id = cs.limpiadora_id
      WHERE cs.id = ${sesionId}::uuid
        AND cs.cliente_id = ${cliente.id}::uuid
      LIMIT 1
    `)
    if (!sesiones.length) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    const sesion = sesiones[0]

    // Fotos
    let fotos: any[] = []
    if (puedeFotos) {
      if (sesion.foto_antes_url)   fotos.push({ tipo: 'antes',   url: sesion.foto_antes_url })
      if (sesion.foto_despues_url) fotos.push({ tipo: 'despues', url: sesion.foto_despues_url })

      const fotosItems = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT sc.item_description, sc.photo_url, sc.photo_url_2, sc.photo_url_3, sc.notes
        FROM session_completions sc
        WHERE sc.session_id = ${sesionId}::uuid
          AND (sc.photo_url IS NOT NULL OR sc.photo_url_2 IS NOT NULL OR sc.photo_url_3 IS NOT NULL)
        ORDER BY sc.completed_at ASC NULLS LAST
      `)
      for (const fi of fotosItems) {
        if (fi.photo_url)   fotos.push({ tipo: 'item', descripcion: fi.item_description, url: fi.photo_url,   notas: fi.notes })
        if (fi.photo_url_2) fotos.push({ tipo: 'item', descripcion: fi.item_description, url: fi.photo_url_2, notas: fi.notes })
        if (fi.photo_url_3) fotos.push({ tipo: 'item', descripcion: fi.item_description, url: fi.photo_url_3, notas: fi.notes })
      }
    }

    // Checklist — JOIN por propiedad_id (UUID) no por property_id (text legacy)
    let checklist: any[] = []
    if (puedeChecklist && sesion.propiedad_id) {
      checklist = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT
          ci.id::text,
          ci.description,
          ci.es_critico,
          ci.requires_photo,
          ci.sort_order,
          ci.frequency,
          COALESCE(sc.checked, false) AS checked,
          sc.notes,
          sc.photo_url,
          sc.completed_at
        FROM checklist_items ci
        JOIN checklist_templates ct ON ct.id = ci.template_id
        LEFT JOIN session_completions sc
          ON sc.item_id = ci.id AND sc.session_id = ${sesionId}::uuid
        WHERE ci.active = true
          AND ct.property_id = ${sesion.propiedad_id.toString()}
          AND ct.empresa_id = ${cliente.empresa_id}::uuid
        ORDER BY ci.sort_order ASC NULLS LAST
      `)
    }

    return NextResponse.json({
      sesion,
      fotos,
      checklist,
      permisos: { ver_checklist: puedeChecklist, ver_fotos: puedeFotos }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
