import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { nimVision } from '@central/core-ai'

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY!
const VISION_MODEL   = 'meta/llama-3.2-90b-vision-instruct'
const nimConfig = () => ({ apiKey: NVIDIA_API_KEY, visionModel: VISION_MODEL })

const PGC_MAP: Record<string, { cuenta: string; nombre: string }> = {
  limpieza:      { cuenta: '623000', nombre: 'Material de limpieza' },
  lenceria:      { cuenta: '621000', nombre: 'Lencería y textiles' },
  consumible:    { cuenta: '623000', nombre: 'Material fungible' },
  amenities:     { cuenta: '623000', nombre: 'Artículos de acogida' },
  herramienta:   { cuenta: '622000', nombre: 'Reparaciones y conservación' },
  mantenimiento: { cuenta: '622000', nombre: 'Reparaciones y conservación' },
  otros:         { cuenta: '629000', nombre: 'Otros servicios' },
}

async function analizarDocumento(base64img: string, mediaType: string, productosStock: any[]) {
  const catalogoStr = productosStock.length
    ? productosStock.map(p => `- id:"${p.id}" nombre:"${p.nombre}" cat:"${p.categoria}" unidad:"${p.unidad}"`).join('\n')
    : '(sin productos en catálogo)'

  const prompt = `You are a Spanish accounting assistant. Analyze this invoice/receipt/delivery note image.
Return ONLY a valid JSON object, no markdown, no explanations:
{
  "tipo_doc": "factura|albaran|ticket|otro",
  "proveedor": "supplier name or null",
  "fecha": "YYYY-MM-DD or null",
  "numero_doc": "document number or null",
  "lineas": [{"descripcion":"item","cantidad":1,"unidad":"unidad","precio_unitario":0.0,"total_linea":0.0,"producto_id":null,"categoria":"limpieza|consumible|lenceria|amenities|herramienta|mantenimiento|otros"}],
  "base_imponible": 0.0,
  "porcentaje_iva": 21,
  "cuota_iva": 0.0,
  "total": 0.0,
  "descripcion_corta": "summary max 60 chars",
  "notas": null,
  "nivel_certeza": "alto|medio|bajo"
}

RULES (read carefully):
- Read every amount EXACTLY as printed. NEVER calculate, infer or guess any number.
- "total" = the amount the recipient must actually PAY. Look for "Total", "Total a pagar", "Importe total", "Importe total pendiente", "Total factura". This is the real expense.
- "cuota_iva" = the VAT amount PRINTED on the document. Do NOT recompute it. "porcentaje_iva" = the printed VAT rate. Only if NO VAT figure appears anywhere, set porcentaje_iva to 21 and cuota_iva to 0.
- "base_imponible" = the taxable base printed (subtotal before VAT). It must satisfy base_imponible + cuota_iva = total (within 0.02). If they do not reconcile, trust the printed "total" and set base_imponible = total - cuota_iva.
- Ignore any amount that is NOT part of the total to pay: informational subtotals, gross sales/booking volumes used only to compute a fee, previous balances, deposits already paid.
- "lineas": one entry per concept/product line, with precio_unitario and total_linea exactly as printed.
- Set "nivel_certeza" to "bajo" if the image is blurry/partial or the numbers do not reconcile.

Stock catalog:
${catalogoStr}

Map producto_id only if the item name clearly matches a catalog entry; copy the catalog id verbatim, otherwise null.`

  const raw = await nimVision(
    nimConfig(), '',
    [{ data: base64img, mediaType }],
    prompt, 800, { temperature: 0.05 },
  )
  const content = raw.replace(/```json|```/g, '').trim()
  try {
    const parsed = JSON.parse(content) as any
    if (parsed.nivel_certeza && !parsed.confianza) {
      parsed.confianza = parsed.nivel_certeza === 'alto' ? 'alta' : parsed.nivel_certeza === 'medio' ? 'media' : 'baja'
    }
    return parsed
  } catch {
    return { tipo_doc:'otro', proveedor:null, fecha:null, numero_doc:null, lineas:[],
      base_imponible:null, porcentaje_iva:null, cuota_iva:null, total:null,
      descripcion_corta:'Error IA', notas:null, confianza:'baja' }
  }
}

function generarApunte(ext: any) {
  if (!ext.total) return []
  const cats = (ext.lineas || []).map((l: any) => l.categoria)
  const catDom = cats.length
    ? cats.sort((a: string, b: string) => cats.filter((c: string) => c===b).length - cats.filter((c: string) => c===a).length)[0]
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

// GET /api/cron/procesar-documentos — processes up to 3 pending docs per run
export async function GET() {
  try {
    // Find pending docs with imagen in notas field
    const pending = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, empresa_id, notas
      FROM documentos_contables
      WHERE tipo_doc = 'pendiente' AND activo = true
        AND notas IS NOT NULL
        AND created_at > now() - interval '2 hours'
      ORDER BY created_at ASC
      LIMIT 3
    `)

    if (!pending.length) return NextResponse.json({ ok: true, processed: 0 })

    let processed = 0
    for (const doc of pending) {
      try {
        const imgData = JSON.parse(doc.notas || '{}')
        if (!imgData.imagen_base64) continue

        const empresa_id = doc.empresa_id

        const productosStock = await prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT id, nombre, categoria, unidad FROM productos_stock
          WHERE empresa_id = ${empresa_id}::uuid AND activo = true
          ORDER BY categoria, nombre
        `)

        const ext = await analizarDocumento(imgData.imagen_base64, imgData.media_type || 'image/jpeg', productosStock)
        const apunte = generarApunte(ext)

        await prisma.$executeRaw(Prisma.sql`
          UPDATE documentos_contables SET
            tipo_doc       = ${ext.tipo_doc},
            proveedor      = ${ext.proveedor || null},
            fecha_doc      = ${ext.fecha || null}::date,
            numero_doc     = ${ext.numero_doc || null},
            base_imponible = ${ext.base_imponible || null},
            porcentaje_iva = ${ext.porcentaje_iva || null},
            cuota_iva      = ${ext.cuota_iva || null},
            total          = ${ext.total || null},
            cuenta_gasto   = ${apunte[0]?.cuenta || '629000'},
            categoria      = ${ext.lineas?.[0]?.categoria || 'otros'},
            descripcion    = ${ext.descripcion_corta},
            notas          = ${ext.notas || null},
            apunte_json    = ${JSON.stringify(apunte)}::jsonb,
            lineas_json    = ${JSON.stringify(ext.lineas || [])}::jsonb
          WHERE id = ${doc.id}::uuid
        `)

        let stock_actualizado = 0
        for (const linea of (ext.lineas || [])) {
          if (!linea.producto_id || !linea.cantidad || linea.cantidad <= 0) continue
          const check = await prisma.$queryRaw<any[]>(Prisma.sql`
            SELECT id FROM productos_stock
            WHERE id = ${linea.producto_id}::uuid AND empresa_id = ${empresa_id}::uuid AND activo = true LIMIT 1
          `)
          if (!check.length) continue
          await prisma.$executeRaw(Prisma.sql`
            UPDATE productos_stock SET stock_actual = stock_actual + ${linea.cantidad}
            WHERE id = ${linea.producto_id}::uuid
          `)
          stock_actualizado++
        }

        if (stock_actualizado > 0) {
          await prisma.$executeRaw(Prisma.sql`
            UPDATE documentos_contables SET procesado_stock = true WHERE id = ${doc.id}::uuid
          `)
        }
        processed++
      } catch (e: any) {
        console.error('[procesar-documentos] doc', doc.id, e.message)
        await prisma.$executeRaw(Prisma.sql`
          UPDATE documentos_contables
          SET tipo_doc='error', descripcion='Error IA: ${e.message?.slice(0,100) || 'unknown'}'
          WHERE id = ${doc.id}::uuid
        `).catch(() => {})
      }
    }

    return NextResponse.json({ ok: true, processed })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
