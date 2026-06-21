import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'
import { createClient } from '@supabase/supabase-js'

// Usamos el anon key — el bucket property-access-files tiene políticas abiertas
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function getCliente(token: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT c.id, c.empresa_id FROM clientes c
    WHERE c.access_token = ${token} AND c.notif_activa = true LIMIT 1
  `)
  return rows[0] || null
}

// GET — devuelve instrucciones_acceso y archivos_acceso de todas las propiedades del cliente
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const cliente = await getCliente(token)
  if (!cliente) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const propiedades = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, nombre, direccion, instrucciones_acceso, archivos_acceso, tipo_acceso, codigo_acceso
    FROM propiedades
    WHERE cliente_id = ${cliente.id}::uuid AND activa = true
    ORDER BY nombre
  `)
  return NextResponse.json(serialize({ propiedades }))
}

// PATCH — el propietario actualiza instrucciones de una propiedad suya
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const cliente = await getCliente(token)
  if (!cliente) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { propiedad_id, instrucciones_acceso, tipo_acceso, codigo_acceso } = await req.json()
  if (!propiedad_id) return NextResponse.json({ error: 'propiedad_id requerido' }, { status: 400 })

  // Verificar que la propiedad pertenece a este cliente
  const check = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id FROM propiedades WHERE id = ${propiedad_id}::uuid AND cliente_id = ${cliente.id}::uuid LIMIT 1
  `)
  if (!check.length) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 })

  await prisma.$executeRaw(Prisma.sql`
    UPDATE propiedades
    SET instrucciones_acceso = ${instrucciones_acceso ?? null},
        tipo_acceso           = ${tipo_acceso ?? 'llave'},
        codigo_acceso         = ${codigo_acceso ?? null},
        updated_at            = now()
    WHERE id = ${propiedad_id}::uuid
  `)

  return NextResponse.json({ ok: true })
}

// POST — sube un archivo adjunto para una propiedad
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const cliente = await getCliente(token)
  if (!cliente) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData  = await req.formData()
  const file      = formData.get('file') as File | null
  const propiedad_id = formData.get('propiedad_id') as string
  const accion    = formData.get('accion') as string // 'add' | 'remove'
  const url_remove = formData.get('url') as string   // para accion='remove'

  if (!propiedad_id) return NextResponse.json({ error: 'propiedad_id requerido' }, { status: 400 })

  // Verificar propiedad
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, archivos_acceso FROM propiedades
    WHERE id = ${propiedad_id}::uuid AND cliente_id = ${cliente.id}::uuid LIMIT 1
  `)
  if (!rows.length) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 })

  let archivos: any[] = rows[0].archivos_acceso || []

  if (accion === 'remove' && url_remove) {
    // Borrar archivo de Storage
    const path = url_remove.split('/property-access-files/')[1]
    if (path) await supabaseAdmin.storage.from('property-access-files').remove([path])
    archivos = archivos.filter((a: any) => a.url !== url_remove)
    await prisma.$executeRaw(Prisma.sql`
      UPDATE propiedades SET archivos_acceso = ${JSON.stringify(archivos)}::jsonb WHERE id = ${propiedad_id}::uuid
    `)
    return NextResponse.json({ ok: true, archivos })
  }

  if (!file) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })

  // Validar tamaño (20MB)
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'Archivo demasiado grande (máx 20MB)' }, { status: 400 })

  // Subir a Storage
  const ext  = file.name.split('.').pop() || 'bin'
  const path = `${cliente.empresa_id}/${propiedad_id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const buf  = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await supabaseAdmin.storage
    .from('property-access-files')
    .upload(path, buf, { contentType: file.type, upsert: false })

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const { data: urlData } = supabaseAdmin.storage
    .from('property-access-files')
    .getPublicUrl(path)

  const nuevoArchivo = {
    url:       urlData.publicUrl,
    nombre:    file.name,
    tipo:      file.type,
    tamano:    file.size,
    subido_at: new Date().toISOString(),
  }

  archivos = [...archivos, nuevoArchivo]
  await prisma.$executeRaw(Prisma.sql`
    UPDATE propiedades SET archivos_acceso = ${JSON.stringify(archivos)}::jsonb WHERE id = ${propiedad_id}::uuid
  `)

  return NextResponse.json({ ok: true, archivo: nuevoArchivo, archivos })
}
