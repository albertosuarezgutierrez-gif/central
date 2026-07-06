import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
// aiComplete de la pasarela CENTRAL: cadena de fallback NIM → Groq → Gemini → Kimi. El de
// lib/ai-client va SOLO a NIM (sin fallback).
import { aiComplete } from '@central/core-ai'
import { SUBCATEGORIAS_GASTO, DESCRIPCION_GASTO, esSubcategoriaValida } from '@/lib/categorias-personales'
import { clasificarPorKeywords } from '@/lib/subcategoria-keywords'
import { normalizarContraparte } from '@/lib/categoria-ia'

export const dynamic = 'force-dynamic'
// Necesario en Vercel: sin esto la función se corta en ~15s y clasificar en tandas no cabe.
export const maxDuration = 60

// Se procesa en LOTES pequeños (no 50 de golpe): una respuesta corta por lote no agota el timeout
// de la IA — el error real era "operation aborted due to timeout" con 50 movimientos en una sola
// llamada. Un lote que falle se salta y no tumba a los demás (éxito parcial).
const CHUNK = 12
const PRESUPUESTO_MS = 48_000 // margen bajo maxDuration para no morir a mitad de un UPDATE

const SYSTEM = `Eres el contable personal de Alberto (España). Para cada gasto bancario personal
asigna la subcategoría que mejor describe el gasto. Responde SOLO un array JSON en el mismo orden:
[{"i":0,"subcategoria":"supermercado"}]

Subcategorías disponibles:
${SUBCATEGORIAS_GASTO.map(s => `- ${s}: ${DESCRIPCION_GASTO[s]}`).join('\n')}`

type Row = { id: string; concepto: string | null; concepto_normalizado: string | null; contraparte: string | null; importe: unknown; cuenta_bancaria_id: string }

// POST /api/finanzas/categorias/auto-tag — clasifica hasta 60 gastos personales sin subcategoría.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT mb.id, mb.concepto, mb.concepto_normalizado, mb.contraparte, mb.importe, mb.cuenta_bancaria_id
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${session.id}::uuid
      AND COALESCE(mb.destino, 'personal') = 'personal'
      AND mb.importe < 0
      AND mb.subcategoria IS NULL
      AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
    ORDER BY mb.fecha_operacion DESC
    LIMIT 60
  `
  if (rows.length === 0) return NextResponse.json({ tagged: 0 })

  let tagged = 0

  // PASO 1 (DETERMINISTA, sin IA): los movimientos obvios por palabra clave (Mercadona, DIA, bares,
  // gasolineras, farmacias, Netflix…) se etiquetan al instante y aprenden regla. Así la pestaña
  // funciona aunque la pasarela de IA esté saturada (429/timeout) — solo lo ambiguo llega a la IA.
  const pendientes: Row[] = []
  for (const r of rows) {
    const sub = clasificarPorKeywords(r.concepto_normalizado || r.concepto, r.contraparte)
    if (!sub) { pendientes.push(r); continue }
    await prisma.$executeRaw`UPDATE movimientos_bancarios SET subcategoria = ${sub} WHERE id = ${r.id}::uuid`
    tagged++
    const clave = normalizarContraparte(r.contraparte)
    if (clave) {
      await prisma.$executeRaw`
        INSERT INTO banca_destino_reglas (cuenta_id, clave, destino, subcategoria)
        SELECT cb.cuenta_id, ${clave}, 'personal', ${sub}
        FROM cuentas_bancarias cb WHERE cb.id = ${r.cuenta_bancaria_id}::uuid
        ON CONFLICT (cuenta_id, clave) DO UPDATE SET subcategoria = EXCLUDED.subcategoria
      `
    }
  }

  // Si el paso determinista lo clasificó TODO, no molestamos a la IA.
  if (pendientes.length === 0) return NextResponse.json({ tagged })

  // PASO 2 (IA, solo lo ambiguo): en LOTES pequeños con presupuesto de tiempo. Un lote que falle se
  // salta (los demás siguen); éxito parcial. Ver comentario de CHUNK/PRESUPUESTO_MS arriba.
  const started = Date.now()
  let algunLoteOk = false

  for (let off = 0; off < pendientes.length; off += CHUNK) {
    if (Date.now() - started > PRESUPUESTO_MS) break // lo que quede lo coge la siguiente pasada
    const chunk = pendientes.slice(off, off + CHUNK)
    const prompt = chunk.map((r, i) => {
      const desc = (r.concepto_normalizado || r.concepto || r.contraparte || '').slice(0, 120)
      return `${i}. [${Math.abs(Number(r.importe)).toFixed(2)}€] ${desc}`
    }).join('\n')

    let parsed: Array<{ i: number; subcategoria: string }>
    try {
      const raw = await aiComplete(prompt, { system: SYSTEM, maxTokens: 700, timeoutMs: 18_000 })
      // Parseo tolerante: extrae el primer array [...] aunque el modelo lo envuelva en texto o fences.
      const match = raw.match(/\[[\s\S]*\]/)
      parsed = JSON.parse(match ? match[0] : raw.replace(/```json|```/g, '').trim())
      if (!Array.isArray(parsed)) throw new Error('respuesta no es array')
    } catch (e) {
      console.error('[auto-tag] lote falló ·', e instanceof Error ? e.message : String(e))
      continue // salta este lote, sigue con el resto
    }

    algunLoteOk = true
    for (const p of parsed) {
      const row = chunk[p.i]
      if (!row) continue
      const sub = esSubcategoriaValida(p.subcategoria) ? p.subcategoria : 'otros_gasto'
      await prisma.$executeRaw`UPDATE movimientos_bancarios SET subcategoria = ${sub} WHERE id = ${row.id}::uuid`
      tagged++
    }
  }

  // Solo es un fallo "duro" si NINGÚN lote de IA respondió Y el paso determinista tampoco etiquetó
  // nada: entonces 502 para que la UI avise (⚠️). Si el determinista clasificó algo, es éxito
  // parcial (200) — la IA cogerá el resto en la siguiente pasada cuando se recupere.
  if (!algunLoteOk && tagged === 0) {
    return NextResponse.json({ error: 'La IA no pudo clasificar ahora mismo. Reinténtalo.' }, { status: 502 })
  }
  return NextResponse.json({ tagged })
}
