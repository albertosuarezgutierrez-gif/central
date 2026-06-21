import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { fingerprint } from '@/lib/sivra/fingerprint'

export const dynamic = 'force-dynamic'

const DRIVE_SCRIPT_URL = process.env.DRIVE_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbwYMhD_7MpiytpoM3fYVW5dRlCUiQgMeTYLvI-5WGfcL-OAdXZEsa3UD7KdZa1PpQ/exec'

function n(v: unknown): number | null {
  if (v === '' || v == null) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year       = searchParams.get('year')
  const month      = searchParams.get('month')
  const propertyId = searchParams.get('propertyId')
  const category   = searchParams.get('category')

  const conditions: Prisma.Sql[] = [Prisma.sql`NOT (revisado = false AND origen IS NOT NULL)`]
  if (year)       conditions.push(Prisma.sql`EXTRACT(YEAR  FROM fecha) = ${parseInt(year)}`)
  if (month)      conditions.push(Prisma.sql`EXTRACT(MONTH FROM fecha) = ${parseInt(month)}`)
  if (propertyId) conditions.push(Prisma.sql`propiedad = ${propertyId}`)
  if (category)   conditions.push(Prisma.sql`categoria = ${category}`)
  const where = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`

  const gastos = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, fecha, proveedor, concepto, categoria, propiedad,
      base_imponible, iva, iva_porcentaje, irpf, irpf_porcentaje, total, notas,
      drive_url, carpeta_drive, drive_file_name, numero_factura, created_at
    FROM gastos
    ${where}
    ORDER BY fecha DESC, created_at DESC
    LIMIT 500
  `)
  const total = gastos.reduce((sum: number, g: any) => sum + parseFloat(g.total || 0), 0)
  return NextResponse.json({ gastos, total })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await req.formData()
  const file           = formData.get('file') as File | null
  const fecha          = formData.get('fecha') as string
  const proveedor      = (formData.get('proveedor') as string) || ''
  const concepto       = (formData.get('concepto') as string) || ''
  const total          = parseFloat((formData.get('total') as string) || '0')
  const categoria      = (formData.get('categoria') as string) || 'OTRO'
  const propiedad      = (formData.get('propiedad') as string) || ''
  const notas          = (formData.get('notas') as string) || ''
  const base_imponible = n(formData.get('base_imponible'))
  const iva            = n(formData.get('iva'))
  const iva_porcentaje = n(formData.get('iva_porcentaje'))
  const irpf           = n(formData.get('irpf'))
  const irpf_porcentaje = n(formData.get('irpf_porcentaje'))
  const numero_factura = (formData.get('numero_factura') as string) || null
  const nif_proveedor  = (formData.get('nif_proveedor')  as string) || null
  const fp = fingerprint({ nif_proveedor, proveedor, concepto })

  if (!fecha || !total) return NextResponse.json({ error: 'Fecha y total obligatorios' }, { status: 400 })

  let driveUrl: string | null = null
  let carpetaDrive: string | null = null
  let driveFileName: string | null = null

  if (file && file.size > 0) {
    try {
      const bytes = await file.arrayBuffer()
      const b64   = Buffer.from(bytes).toString('base64')
      const driveRes = await fetch(DRIVE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, base64Data: b64, folder: propiedad || 'gastos' }),
      })
      if (driveRes.ok) {
        const dr = await driveRes.json()
        driveUrl      = dr.webViewLink || dr.url || null
        carpetaDrive  = propiedad || 'gastos'
        driveFileName = file.name
      }
    } catch (e) {
      console.warn('[expenses POST] Drive upload failed:', e)
    }
  }

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO gastos
      (fecha, proveedor, nif_proveedor, numero_factura, concepto, categoria, propiedad,
       base_imponible, iva, iva_porcentaje, irpf, irpf_porcentaje, total, notas,
       drive_url, carpeta_drive, drive_file_name, fingerprint, origen, revisado)
    VALUES
      (${fecha}::date, ${proveedor || null}, ${nif_proveedor}, ${numero_factura},
       ${concepto || null}, ${categoria}, ${propiedad || null},
       ${base_imponible}, ${iva}, ${iva_porcentaje}, ${irpf}, ${irpf_porcentaje}, ${total},
       ${notas || null}, ${driveUrl}, ${carpetaDrive}, ${driveFileName},
       ${fp || null}, 'manual', true)
  `)

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  await prisma.$executeRaw(Prisma.sql`DELETE FROM gastos WHERE id = ${id}::uuid`)
  return NextResponse.json({ ok: true })
}
