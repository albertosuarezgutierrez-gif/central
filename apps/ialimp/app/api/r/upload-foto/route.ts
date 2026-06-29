import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const BUCKET        = 'cleaning-photos'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const safeSeg = (s: string) => (s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)

async function getRepartidor() {
  const cookieStore = await cookies()
  const token = cookieStore.get('repartidor_token')?.value
  if (!token) return null
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT r.id::text AS id, r.empresa_id::text AS empresa_id
    FROM repartidor_sessions s
    JOIN repartidores r ON r.id = s.repartidor_id
    WHERE s.token = ${token} AND s.expires_at > now() AND r.activo = true
    LIMIT 1
  `)
  return rows[0] || null
}

export async function POST(req: NextRequest) {
  const rep = await getRepartidor()
  if (!rep) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const form     = await req.formData()
  const file     = form.get('file') as File | null
  const item_id  = safeSeg((form.get('item_id') as string) || '')
  const parada_id = ((form.get('parada_id') as string) || '').trim()

  if (!file)                      return NextResponse.json({ error: 'No file' }, { status: 400 })
  if (!UUID_RE.test(parada_id))   return NextResponse.json({ error: 'parada_id inválido' }, { status: 400 })
  if (!item_id)                   return NextResponse.json({ error: 'item_id requerido' }, { status: 400 })
  if (!(file.type || '').startsWith('image/'))
    return NextResponse.json({ error: 'Solo imágenes' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  if (bytes.byteLength > 10 * 1024 * 1024)
    return NextResponse.json({ error: 'Foto demasiado grande (máx 10MB)' }, { status: 400 })

  // Verificar que la parada pertenece a este repartidor
  const parada = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id FROM repartidor_paradas
    WHERE id = ${parada_id}::uuid AND repartidor_id = ${rep.id}::uuid
    LIMIT 1
  `)
  if (!parada.length) return NextResponse.json({ error: 'Parada no encontrada' }, { status: 404 })

  const ts   = Date.now()
  const path = `repartidor/${parada_id}/${item_id}_${ts}.jpg`
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`

  const resp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON}`,
      'Content-Type': file.type || 'image/jpeg',
      'x-upsert': 'true',
      'Cache-Control': 'max-age=432000',
    },
    body: bytes,
  })

  if (!resp.ok) {
    const err = await resp.text()
    return NextResponse.json({ error: `Storage error ${resp.status}: ${err}` }, { status: 500 })
  }

  const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
  return NextResponse.json({ url })
}
