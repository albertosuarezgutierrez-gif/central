import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId, requireSession } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

const APP_URL = process.env.NEXTAUTH_URL || 'https://app.ialimp.es'

// POST /api/admin/escanear
// Receives image, saves doc as "pendiente", fires background analysis, returns immediately
export async function POST(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const body = await req.json()
    const { imagen_base64, media_type, cliente_id, propiedad_id } = body

    if (!imagen_base64) return NextResponse.json({ error: 'imagen_base64 requerida' }, { status: 400 })

    // Save doc immediately as "pendiente" with image in lineas_json for processing
    const docRows = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO documentos_contables (
        empresa_id, cliente_id, propiedad_id,
        tipo_doc, descripcion, procesado_stock, notas
      ) VALUES (
        ${empresa_id}::uuid,
        ${cliente_id || empresa_id}::uuid,
        ${propiedad_id || null}::uuid,
        'pendiente',
        'Analizando con IA…',
        false,
        ${JSON.stringify({ imagen_base64, media_type: media_type || 'image/jpeg' })}
      )
      RETURNING id
    `)
    const doc_id = docRows[0]?.id

    // Fire-and-forget background analysis (same pattern as analizar-foto).
    // Auth interna: el middleware y el handler exigen Bearer CRON_SECRET.
    fetch(APP_URL + '/api/admin/escanear/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (process.env.CRON_SECRET || ''),
      },
      body: JSON.stringify({ doc_id, empresa_id, imagen_base64, media_type: media_type || 'image/jpeg' })
    }).catch(() => {})

    return NextResponse.json({ ok: true, doc_id, estado: 'procesando' })

  } catch (e: any) {
    console.error('[escanear POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET /api/admin/escanear?limit=20&offset=0
export async function GET(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const limit  = Math.min(parseInt(searchParams.get('limit')  || '20'), 50)
    const offset = parseInt(searchParams.get('offset') || '0')

    const docs = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, tipo_doc, proveedor, fecha_doc, numero_doc,
             base_imponible, porcentaje_iva, cuota_iva, total,
             cuenta_gasto, categoria, descripcion, notas,
             procesado_stock, lineas_json, apunte_json, created_at
      FROM documentos_contables
      WHERE empresa_id = ${empresa_id}::uuid AND activo = true
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `)

    const total_count = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT COUNT(*)::int as n FROM documentos_contables
      WHERE empresa_id = ${empresa_id}::uuid AND activo = true
    `)

    // Strip imagen_base64 from notas (only used during processing)
    const cleanDocs = docs.map(d => {
      if (d.tipo_doc === 'pendiente' && d.notas) {
        try {
          const n = JSON.parse(d.notas)
          if (n.imagen_base64) return { ...d, notas: null }
        } catch {}
      }
      return d
    })

    return NextResponse.json({ docs: cleanDocs, total: total_count[0]?.n || 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
