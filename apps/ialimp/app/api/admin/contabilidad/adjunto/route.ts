import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'documentos-contables'

// POST /api/admin/contabilidad/adjunto   (FormData: tipo, id, file)
// Sube un justificante (PDF/imagen) a Storage y guarda su URL en el apunte.
// tipo = 'gasto' (documentos_contables) | 'ingreso' (ingresos_manuales)
export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const form = await req.formData()
    const tipo = form.get('tipo') as string
    const id = form.get('id') as string
    const file = form.get('file') as File | null

    if (!id || !file) return NextResponse.json({ error: 'Falta el id o el archivo' }, { status: 400 })
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'Archivo demasiado grande (máx 20MB)' }, { status: 400 })
    const tabla = tipo === 'ingreso' ? 'ingresos_manuales' : 'documentos_contables'

    // Verifica que el apunte pertenece a la empresa
    const owner = await prisma.$queryRaw<any[]>(
      tabla === 'ingresos_manuales'
        ? Prisma.sql`SELECT id FROM ingresos_manuales WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1`
        : Prisma.sql`SELECT id FROM documentos_contables WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1`
    )
    if (!owner.length) return NextResponse.json({ error: 'Apunte no encontrado' }, { status: 404 })

    const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
    const path = `${empresa_id}/${id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const buf = Buffer.from(await file.arrayBuffer())

    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: file.type || 'application/octet-stream', upsert: false })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
    const documento_url = urlData.publicUrl

    if (tabla === 'ingresos_manuales') {
      await prisma.$executeRaw(Prisma.sql`UPDATE ingresos_manuales SET documento_url = ${documento_url} WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid`)
    } else {
      await prisma.$executeRaw(Prisma.sql`UPDATE documentos_contables SET documento_url = ${documento_url} WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid`)
    }

    return NextResponse.json({ ok: true, documento_url })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
