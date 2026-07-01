import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'

const BUCKET = 'rrhh-logos'

export async function POST(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const contentType = req.headers.get('content-type') || 'image/png'
  const ext = contentType.split('/')[1]?.split(';')[0]?.replace('jpeg', 'jpg') || 'png'
  const slug = req.headers.get('x-nombre') || Date.now().toString()
  const path = `${slug.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.${ext}`

  const bytes = await req.arrayBuffer()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return NextResponse.json({ error: 'Storage no configurado' }, { status: 500 })

  const r = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: bytes,
  })
  if (!r.ok) return NextResponse.json({ error: `Upload error ${r.status}` }, { status: 500 })

  const url = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`
  return NextResponse.json({ url })
}
