export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// POST — importación masiva CSV de materiales
// Acepta multipart/form-data (campo "file") o JSON { csv: "..." }
// Columnas CSV: nombre,categoria,tipo,estado,cantidad_total,cantidad_disponible,
//               precio_compra,coste_reposicion,unidad,stock_minimo,descripcion

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n').map(l => l.replace(/\r$/, ''))
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
  return lines.slice(1).map(line => {
    const cols: string[] = []
    let cur = ''
    let inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue }
      if (ch === ',' && !inQ) { cols.push(cur); cur = ''; continue }
      cur += ch
    }
    cols.push(cur)
    return Object.fromEntries(headers.map((h, i) => [h, (cols[i] ?? '').trim()]))
  })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  let csvText: string
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('multipart/form-data')) {
    const fd = await req.formData()
    const file = fd.get('file')
    if (!file || typeof file === 'string') return NextResponse.json({ error: 'Archivo CSV requerido (campo "file")' }, { status: 400 })
    csvText = await (file as File).text()
  } else {
    const body = await req.json().catch(() => null)
    if (!body?.csv) return NextResponse.json({ error: 'CSV requerido: multipart "file" o JSON { csv }' }, { status: 400 })
    csvText = body.csv as string
  }

  const rows = parseCSV(csvText)
  if (!rows.length) return NextResponse.json({ error: 'CSV vacío o sin filas de datos' }, { status: 400 })

  const resultados: { nombre: string; accion: 'creado' | 'error'; error?: string }[] = []

  for (const row of rows) {
    const nombre = (row['nombre'] ?? '').trim()
    if (!nombre) continue
    const { error } = await supabase.from('materiales').insert({
      restaurante_id: rid,
      nombre,
      categoria: row['categoria'] || null,
      tipo: row['tipo'] || 'activo',
      estado: row['estado'] || 'operativo',
      cantidad_total: Number(row['cantidad_total'] || 0),
      cantidad_disponible: Number(row['cantidad_disponible'] ?? row['cantidad_total'] ?? 0),
      precio_compra: Number(row['precio_compra'] || 0),
      coste_reposicion: Number(row['coste_reposicion'] ?? row['precio_compra'] ?? 0),
      unidad: row['unidad'] || null,
      stock_minimo: row['stock_minimo'] ? Number(row['stock_minimo']) : null,
      descripcion: row['descripcion'] || null,
      activo: true,
    })
    resultados.push({ nombre, accion: error ? 'error' : 'creado', error: error?.message })
  }

  const creados = resultados.filter(r => r.accion === 'creado').length
  const errores = resultados.filter(r => r.accion === 'error').length
  return NextResponse.json({ ok: true, creados, errores, resultados })
}

// GET — devuelve plantilla CSV descargable
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const plantilla = [
    'nombre,categoria,tipo,estado,cantidad_total,cantidad_disponible,precio_compra,coste_reposicion,unidad,stock_minimo,descripcion',
    'Silla plegable,Mobiliario,activo,operativo,20,20,45.00,45.00,ud,5,Silla estándar plegable',
    'Servilletas lino,Menaje,consumible,operativo,200,200,1.50,1.50,ud,,',
  ].join('\n')
  return new NextResponse(plantilla, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="plantilla-materiales.csv"',
    },
  })
}
