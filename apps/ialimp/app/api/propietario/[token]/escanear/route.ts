import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY!

const PGC_MAP: Record<string, { cuenta: string; nombre: string }> = {
  limpieza:      { cuenta: '623000', nombre: 'Material de limpieza' },
  lenceria:      { cuenta: '621000', nombre: 'Lencería y textiles' },
  consumible:    { cuenta: '623000', nombre: 'Material fungible' },
  amenities:     { cuenta: '623000', nombre: 'Artículos de acogida' },
  herramienta:   { cuenta: '622000', nombre: 'Reparaciones y conservación' },
  mantenimiento: { cuenta: '622000', nombre: 'Reparaciones y conservación' },
  otros:         { cuenta: '629000', nombre: 'Otros servicios' },
}

async function resolveCliente(token: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT c.id as cliente_id, c.empresa_id, c.nombre
    FROM clientes c
    WHERE c.token_acceso = ${token} AND c.activo = true
    LIMIT 1
  `)
  return rows[0] || null
}

async function analizarDocumento(base64: string, mediaType: string, productosStock: any[]) {
  const catalogoStr = productosStock.length
    ? productosStock.map(p => `- id:"${p.id}" nombre:"${p.nombre}" cat:"${p.categoria}" unidad:"${p.unidad}"`).join('\n')
    : '(sin productos en catálogo)'

  const prompt = `Eres un contable especializado en empresas de limpieza en España.
Analiza este documento y devuelve ÚNICAMENTE JSON válido sin markdown:
{
  "tipo_doc": "factura|albaran|ticket|otro",
  "proveedor": "nombre o null",
  "fecha": "YYYY-MM-DD o null",
  "numero_doc": "número o null",
  "lineas": [{"descripcion":"","cantidad":0,"unidad":"unidad","precio_unitario":null,"total_linea":null,"producto_id":null,"categoria":"limpieza|consumible|lenceria|amenities|herramienta|mantenimiento|otros"}],
  "base_imponible": null,
  "porcentaje_iva": null,
  "cuota_iva": null,
  "total": null,
  "descripcion_corta": "resumen max 60 chars",
  "notas": null,
  "nivel_certeza": "alto|medio|bajo"
}

CATÁLOGO STOCK EMPRESA:
${catalogoStr}

Mapea producto_id si coincide nombre/descripción con el catálogo. IVA 21% si no se especifica.`

  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + NVIDIA_API_KEY },
    body: JSON.stringify({
      model: 'meta/llama-3.2-90b-vision-instruct',
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
        { type: 'text', text: prompt },
      ]}],
      temperature: 0.1, max_tokens: 1200,
    }),
  })
  if (!res.ok) throw new Error('Error NVIDIA NIM: ' + res.status)
  const data = await res.json()
  const content = (data.choices?.[0]?.message?.content || '{}').replace(/```json|```/g, '').trim()
  try {
    const parsed = JSON.parse(content) as any
    if (parsed.nivel_certeza && !parsed.confianza) {
      parsed.confianza = parsed.nivel_certeza === 'alto' ? 'alta' : parsed.nivel_certeza === 'medio' ? 'media' : 'baja'
    }
    parsed.confianza = parsed.confianza || 'media'
    return parsed
  } catch {
    return { tipo_doc:'otro', proveedor:null, fecha:null, numero_doc:null, lineas:[],
      base_imponible:null, porcentaje_iva:null, cuota_iva:null, total:null,
      descripcion_corta:'Documento no procesado', notas:'Error IA', confianza:'baja' }
  }
}

function generarApunte(ext: any) {
  if (!ext.total) return []
  const cats = ext.lineas?.map((l: any) => l.categoria) || []
  const catDom = cats.length
    ? cats.sort((a: string, b: string) => cats.filter((c: string) => c === b).length - cats.filter((c: string) => c === a).length)[0]
    : 'otros'
  const pgc = PGC_MAP[catDom] || PGC_MAP['otros']
  const base = ext.base_imponible ?? ext.total
  const iva = ext.cuota_iva ?? 0
  return [
    { cuenta: pgc.cuenta, nombre: pgc.nombre, debe: base.toFixed(2), haber: '' },
    ...(iva > 0 ? [{ cuenta: '472000', nombre: 'H.P. IVA soportado', debe: iva.toFixed(2), haber: '' }] : []),
    { cuenta: '410000', nombre: 'Acreedores por prestación servicios', debe: '', haber: ext.total.toFixed(2) },
  ]
}

// POST /api/propietario/[token]/escanear
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const { token } = await params
    const cliente = await resolveCliente(token)
    if (!cliente) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { empresa_id, cliente_id } = cliente
    const body = await req.json()
    const { imagen_base64, media_type, propiedad_id, actualizar_stock = true } = body

    if (!imagen_base64) return NextResponse.json({ error: 'imagen_base64 requerida' }, { status: 400 })
    if (!NVIDIA_API_KEY) return NextResponse.json({ error: 'NVIDIA_API_KEY no configurada' }, { status: 500 })

    const productosStock = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre, categoria, unidad, stock_actual
      FROM productos_stock
      WHERE empresa_id = ${empresa_id}::uuid AND activo = true
      ORDER BY categoria, nombre
    `)

    const ext = await analizarDocumento(imagen_base64, media_type || 'image/jpeg', productosStock)
    const apunte = generarApunte(ext)

    const docRows = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO documentos_contables (
        empresa_id, cliente_id, propiedad_id,
        tipo_doc, proveedor, fecha_doc, numero_doc,
        base_imponible, porcentaje_iva, cuota_iva, total,
        cuenta_gasto, categoria, descripcion, notas,
        apunte_json, lineas_json, procesado_stock
      ) VALUES (
        ${empresa_id}::uuid, ${cliente_id}::uuid, ${propiedad_id || null}::uuid,
        ${ext.tipo_doc}, ${ext.proveedor || null},
        ${ext.fecha || null}::date, ${ext.numero_doc || null},
        ${ext.base_imponible || null}, ${ext.porcentaje_iva || null},
        ${ext.cuota_iva || null}, ${ext.total || null},
        ${apunte[0]?.cuenta || '629000'},
        ${ext.lineas?.[0]?.categoria || 'otros'},
        ${ext.descripcion_corta}, ${ext.notas || null},
        ${JSON.stringify(apunte)}::jsonb,
        ${JSON.stringify(ext.lineas || [])}::jsonb,
        false
      ) RETURNING id
    `)
    const doc_id = docRows[0]?.id

    let stock_actualizado = 0
    if (actualizar_stock && ext.lineas?.length > 0) {
      for (const linea of ext.lineas) {
        if (!linea.producto_id || !linea.cantidad || linea.cantidad <= 0) continue
        const check = await prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT id FROM productos_stock
          WHERE id = ${linea.producto_id}::uuid AND empresa_id = ${empresa_id}::uuid AND activo = true
          LIMIT 1
        `)
        if (!check.length) continue
        await prisma.$executeRaw(Prisma.sql`
          UPDATE productos_stock SET stock_actual = stock_actual + ${linea.cantidad}
          WHERE id = ${linea.producto_id}::uuid AND empresa_id = ${empresa_id}::uuid
        `)
        stock_actualizado++
      }
      if (stock_actualizado > 0 && doc_id) {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE documentos_contables SET procesado_stock = true WHERE id = ${doc_id}::uuid
        `)
      }
    }

    return NextResponse.json({
      ok: true, doc_id, tipo_doc: ext.tipo_doc, proveedor: ext.proveedor,
      total: ext.total, datos_ia: ext, apunte, stock_actualizado, confianza: ext.confianza,
    })
  } catch (e: any) {
    console.error('[propietario/escanear]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET /api/propietario/[token]/documentos — historial de documentos del cliente
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const { token } = await params
    const cliente = await resolveCliente(token)
    if (!cliente) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const docs = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, tipo_doc, proveedor, fecha_doc, numero_doc,
             total, categoria, descripcion, procesado_stock, created_at
      FROM documentos_contables
      WHERE cliente_id = ${cliente.cliente_id}::uuid AND activo = true
      ORDER BY created_at DESC
      LIMIT 30
    `)
    return NextResponse.json({ docs })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
