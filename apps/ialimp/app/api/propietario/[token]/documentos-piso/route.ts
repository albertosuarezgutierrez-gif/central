// Archivador de documentos del piso (contrato de alquiler/explotación, licencia
// VFT, seguro, escritura, IBI, certificado energético, etc.). Gestionado por el
// propietario desde su portal. Se guarda en la columna jsonb propiedades.documentos
// y los ficheros en el bucket documentos-propiedad.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { serialize } from '@/lib/serialize'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'documentos-propiedad'
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CATEGORIAS = ['contrato','licencia_vft','seguro','escritura','impuestos','cee','suministros','otros']

async function getCliente(token: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT c.id, c.empresa_id FROM clientes c
    WHERE c.access_token = ${token} AND c.notif_activa = true LIMIT 1
  `)
  return rows[0] || null
}

async function getPropiedad(propiedad_id: string, cliente_id: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, documentos FROM propiedades
    WHERE id = ${propiedad_id}::uuid AND cliente_id = ${cliente_id}::uuid LIMIT 1
  `)
  return rows[0] || null
}

async function guardarDocs(propiedad_id: string, docs: any[]) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE propiedades SET documentos = ${JSON.stringify(docs)}::jsonb, updated_at = now()
    WHERE id = ${propiedad_id}::uuid
  `)
}

// GET — documentos de todas las propiedades del cliente
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const cliente = await getCliente(token)
  if (!cliente) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const propiedades = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, nombre, documentos
    FROM propiedades
    WHERE cliente_id = ${cliente.id}::uuid AND activa = true
    ORDER BY nombre
  `)
  return NextResponse.json(serialize({ propiedades }))
}

// POST — añadir o borrar un documento (FormData)
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const cliente = await getCliente(token)
  if (!cliente) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const fd = await req.formData()
  const accion       = fd.get('accion') as string // 'add' | 'remove'
  const propiedad_id = fd.get('propiedad_id') as string
  if (!propiedad_id) return NextResponse.json({ error: 'propiedad_id requerido' }, { status: 400 })

  const prop = await getPropiedad(propiedad_id, cliente.id)
  if (!prop) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 })
  let docs: any[] = prop.documentos || []

  if (accion === 'remove') {
    const id  = fd.get('id') as string
    const doc = docs.find((d: any) => d.id === id)
    if (doc?.url) {
      const path = doc.url.split(`/${BUCKET}/`)[1]
      if (path) await supabaseAdmin.storage.from(BUCKET).remove([path])
    }
    docs = docs.filter((d: any) => d.id !== id)
    await guardarDocs(propiedad_id, docs)
    return NextResponse.json({ ok: true, documentos: docs })
  }

  // add
  const file = fd.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'Archivo demasiado grande (máx 20MB)' }, { status: 400 })

  const categoria  = (fd.get('categoria') as string) || 'otros'
  const caducidad  = (fd.get('caducidad') as string) || null
  const compartido = fd.get('compartido') === 'true'
  const notas      = (fd.get('notas') as string) || ''

  const ext  = file.name.split('.').pop() || 'bin'
  const path = `${cliente.empresa_id}/${propiedad_id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const buf  = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET).upload(path, buf, { contentType: file.type, upsert: false })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)

  const nuevo = {
    id:        Math.random().toString(36).slice(2) + Date.now().toString(36),
    url:       urlData.publicUrl,
    nombre:    file.name,
    tipo:      file.type,
    tamano:    file.size,
    subido_at: new Date().toISOString(),
    categoria: CATEGORIAS.includes(categoria) ? categoria : 'otros',
    caducidad: caducidad || null,
    compartido,
    notas,
  }
  docs = [...docs, nuevo]
  await guardarDocs(propiedad_id, docs)
  return NextResponse.json({ ok: true, documento: nuevo, documentos: docs })
}

// PATCH — editar metadatos de un documento (categoría, caducidad, compartido, notas)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const cliente = await getCliente(token)
  if (!cliente) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { propiedad_id, id, categoria, caducidad, compartido, notas } = await req.json()
  if (!propiedad_id || !id) return NextResponse.json({ error: 'propiedad_id e id requeridos' }, { status: 400 })

  const prop = await getPropiedad(propiedad_id, cliente.id)
  if (!prop) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 })

  const docs: any[] = (prop.documentos || []).map((d: any) => {
    if (d.id !== id) return d
    return {
      ...d,
      categoria:  categoria  !== undefined ? (CATEGORIAS.includes(categoria) ? categoria : d.categoria) : d.categoria,
      caducidad:  caducidad  !== undefined ? (caducidad || null) : d.caducidad,
      compartido: compartido !== undefined ? !!compartido : d.compartido,
      notas:      notas      !== undefined ? notas : d.notas,
    }
  })
  await guardarDocs(propiedad_id, docs)
  return NextResponse.json({ ok: true, documentos: docs })
}
