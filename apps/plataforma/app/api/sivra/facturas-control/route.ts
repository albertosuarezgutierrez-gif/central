import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { PROVEEDORES_RECURRENTES, esperadoEnMes } from '@/lib/sivra/facturas-control'

export const dynamic = 'force-dynamic'

const DRIVE_SCRIPT_URL = process.env.DRIVE_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbwYMhD_7MpiytpoM3fYVW5dRlCUiQgMeTYLvI-5WGfcL-OAdXZEsa3UD7KdZa1PpQ/exec'

const CARPETA_BASE: Record<string, string> = {
  turistico_pisos:  'Pisos turísticos',
  turistico_duplex: 'Duplex',
  personal:         'Personal',
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const año = parseInt(searchParams.get('año') || String(new Date().getFullYear()))
  const mes  = parseInt(searchParams.get('mes')  || String(new Date().getMonth() + 1))

  const registros = await prisma.$queryRaw<Array<{ proveedor: string; drive_url: string | null; importe: number | null }>>(
    Prisma.sql`SELECT proveedor, drive_url, importe::float FROM facturas_drive WHERE anio = ${año} AND mes = ${mes}`
  )
  const driveMap = Object.fromEntries(registros.map(r => [r.proveedor, r]))

  const proveedores = PROVEEDORES_RECURRENTES
    .filter(p => esperadoEnMes(p, año, mes))
    .map(p => ({
      ...p,
      driveUrl: driveMap[p.id]?.drive_url ?? null,
      importe:  driveMap[p.id]?.importe ?? null,
    }))

  return NextResponse.json({ proveedores, año, mes })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await req.formData()
  const file      = formData.get('file') as File | null
  const proveedor = formData.get('proveedor') as string
  const año       = parseInt(formData.get('año') as string)
  const mes       = parseInt(formData.get('mes') as string)
  const importe   = parseFloat((formData.get('importe') as string) || '0') || null

  if (!file || !proveedor || !año || !mes) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }

  const prov = PROVEEDORES_RECURRENTES.find(p => p.id === proveedor)
  if (!prov) return NextResponse.json({ error: 'Proveedor desconocido' }, { status: 400 })

  const subcarpeta = CARPETA_BASE[prov.destino] ?? 'Gastos'
  const folder = `Facturas/${año}/${subcarpeta}`
  const fileName = `${año}-${String(mes).padStart(2, '0')}-01_${proveedor}${importe ? `_${importe}` : ''}.pdf`

  let driveUrl: string | null = null
  let driveFileId: string | null = null

  try {
    const bytes = await file.arrayBuffer()
    const b64   = Buffer.from(bytes).toString('base64')
    const driveRes = await fetch(DRIVE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, mimeType: file.type, base64Data: b64, folder }),
    })
    if (driveRes.ok) {
      const dr = await driveRes.json()
      driveUrl    = dr.webViewLink || dr.url || null
      driveFileId = dr.id || null
    }
  } catch (e) {
    console.warn('[facturas-control POST] Drive upload failed:', e)
  }

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO facturas_drive (proveedor, anio, mes, drive_url, drive_file_id, importe, nombre_archivo, fuente)
    VALUES (${proveedor}, ${año}, ${mes}, ${driveUrl}, ${driveFileId}, ${importe}, ${fileName}, 'manual')
    ON CONFLICT (proveedor, anio, mes) DO UPDATE
      SET drive_url      = EXCLUDED.drive_url,
          drive_file_id  = EXCLUDED.drive_file_id,
          importe        = COALESCE(EXCLUDED.importe, facturas_drive.importe),
          nombre_archivo = EXCLUDED.nombre_archivo,
          fuente         = 'manual'
  `)

  return NextResponse.json({ ok: true, driveUrl })
}
