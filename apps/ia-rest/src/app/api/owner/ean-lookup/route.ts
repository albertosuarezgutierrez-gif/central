export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

/**
 * GET /api/owner/ean-lookup?ean=8412345000019
 * Consulta Open Food Facts para obtener nombre, alérgenos, categoría.
 * El EAN-13 no contiene caducidad/lote — se obtienen por OCR o GS1-128.
 */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const ean = req.nextUrl.searchParams.get('ean')?.trim()
  if (!ean || !/^\d{8,14}$/.test(ean)) {
    return NextResponse.json({ error: 'EAN inválido' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=product_name,product_name_es,allergens_tags,categories_tags,quantity,brands,nutriments,nutriscore_grade`,
      { headers: { 'User-Agent': 'ia.rest/1.0 (contact@iarest.es)' }, signal: AbortSignal.timeout(5000) }
    )

    if (!res.ok) return NextResponse.json({ encontrado: false, ean })

    const json = await res.json()
    if (json.status !== 1 || !json.product) return NextResponse.json({ encontrado: false, ean })

    const p = json.product

    const MAP_ALERGENOS: Record<string, string> = {
      'en:gluten': 'Gluten', 'en:milk': 'Lácteos', 'en:eggs': 'Huevo',
      'en:nuts': 'Frutos de cáscara', 'en:peanuts': 'Cacahuetes',
      'en:soybeans': 'Soja', 'en:fish': 'Pescado', 'en:crustaceans': 'Crustáceos',
      'en:celery': 'Apio', 'en:mustard': 'Mostaza', 'en:sesame-seeds': 'Sésamo',
      'en:sulphur-dioxide-and-sulphites': 'Sulfitos', 'en:lupin': 'Altramuces',
      'en:molluscs': 'Moluscos',
    }
    const alergenos = (p.allergens_tags ?? [])
      .map((t: string) => MAP_ALERGENOS[t] ?? null)
      .filter(Boolean)

    const cats: string[] = (p.categories_tags ?? [])
    const categoria = cats
      .filter((c: string) => c.startsWith('es:') || c.startsWith('fr:'))
      .map((c: string) => c.replace(/^(es:|fr:|en:)/, ''))
      .slice(0, 1)[0] ?? ''

    const nombre = p.product_name_es || p.product_name || ''
    const marca  = p.brands ?? ''

    return NextResponse.json({
      encontrado: true,
      ean,
      nombre: nombre ? `${nombre}${marca ? ' — ' + marca : ''}` : '',
      alergenos,
      categoria,
      cantidad: p.quantity ?? '',
      nutriscore: p.nutriscore_grade ?? null,
    })
  } catch {
    return NextResponse.json({ encontrado: false, ean, error: 'timeout' })
  }
}
