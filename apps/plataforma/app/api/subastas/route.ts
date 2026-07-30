// Listado del corpus de subastas, paginado en SERVIDOR (regla de rendimiento:
// nunca montar cientos de filas de golpe).
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireEmpresaId } from '@/lib/tenant'
import { evaluarOportunidad } from '@central/module-subastas'
import { COLS_SUBASTA, filaASubasta } from '@/lib/subastas-radar'

export const dynamic = 'force-dynamic'

const POR_PAGINA = 30

export async function GET(req: NextRequest) {
  try {
    await requireEmpresaId()
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const sp = new URL(req.url).searchParams
  const provincia = sp.get('provincia')
  const q = sp.get('q')
  const enPlazo = sp.get('en_plazo') !== 'false'
  const precioMax = sp.get('precio_max')
  const pagina = Math.max(parseInt(sp.get('page') || '1', 10) || 1, 1)
  const offset = (pagina - 1) * POR_PAGINA
  // Filtros de lente (29/07/2026): tipo de bien, playa Huelva, m², €/m²,
  // riesgo de ocupación, margen flip y semáforo documental. Todos server-side
  // sobre columnas que rellena `clasificarSubastas` (regla de rendimiento).
  const tipo = sp.get('tipo')
  const playa = sp.get('playa') === 'true'
  const m2min = Number(sp.get('m2_min'))
  const m2max = Number(sp.get('m2_max'))
  const eurM2Max = Number(sp.get('eur_m2_max'))
  const sinOcupadas = sp.get('sin_ocupadas') === 'true'
  const margenMin = Number(sp.get('margen_min'))
  const semaforo = sp.get('semaforo')
  const municipio = sp.get('municipio')

  const cond: Prisma.Sql[] = [Prisma.sql`es_inmueble = true`]
  if (provincia && provincia !== 'all') cond.push(Prisma.sql`provincia = ${provincia}`)
  if (enPlazo) cond.push(Prisma.sql`(fecha_fin IS NULL OR fecha_fin >= now())`)
  if (precioMax) {
    const p = Number(precioMax)
    if (Number.isFinite(p)) cond.push(Prisma.sql`(valor_subasta IS NULL OR valor_subasta <= ${p})`)
  }
  if (q && q.trim()) cond.push(Prisma.sql`fts @@ plainto_tsquery('spanish', ${q.trim()})`)
  if (tipo && tipo !== 'all') cond.push(Prisma.sql`tipo_bien = ${tipo}`)
  if (playa) cond.push(Prisma.sql`es_playa = true`)
  if (Number.isFinite(m2min) && m2min > 0) cond.push(Prisma.sql`COALESCE(superficie_catastro, superficie) >= ${m2min}`)
  if (Number.isFinite(m2max) && m2max > 0) cond.push(Prisma.sql`COALESCE(superficie_catastro, superficie) <= ${m2max}`)
  if (Number.isFinite(eurM2Max) && eurM2Max > 0) {
    cond.push(Prisma.sql`valor_subasta / NULLIF(COALESCE(superficie_catastro, superficie), 0) <= ${eurM2Max}`)
  }
  if (sinOcupadas) cond.push(Prisma.sql`(situacion_posesoria IS NULL OR situacion_posesoria NOT IN ('ocupada', 'ocupada_desconocida'))`)
  if (Number.isFinite(margenMin) && margenMin > 0) {
    cond.push(Prisma.sql`flip_apto = true AND margen_flip_pct >= ${margenMin / 100}`)
  }
  if (semaforo === 'verde') cond.push(Prisma.sql`semaforo = 'verde'`)
  // «Sin 🔴 problema» = ANALIZADA y sin bandera roja. `IS DISTINCT FROM` daba
  // TRUE también para NULL, así que colaba las subastas que nunca se han
  // analizado entre las que se han comprobado limpias — indistinguibles, y en
  // el filtro con el que se decide a cuáles dedicar tiempo.
  else if (semaforo === 'sin_rojo') cond.push(Prisma.sql`semaforo IS NOT NULL AND semaforo <> 'rojo'`)
  if (municipio && municipio.trim()) cond.push(Prisma.sql`(municipio ILIKE ${'%' + municipio.trim() + '%'} OR descripcion ILIKE ${'%' + municipio.trim() + '%'})`)

  const where = Prisma.sql`WHERE ${Prisma.join(cond, ' AND ')}`

  try {
    const [filas, total] = await Promise.all([
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT ${COLS_SUBASTA} FROM subastas ${where}
        ORDER BY fecha_fin ASC NULLS LAST, actualizado_en DESC
        LIMIT ${POR_PAGINA} OFFSET ${offset}
      `),
      prisma.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT COUNT(*)::int AS total FROM subastas ${where}`),
    ])

    // La oportunidad se calcula al vuelo: es determinista y barato, y así
    // refleja siempre el último enriquecimiento sin quedarse cacheada.
    const resultados = filas.map((f) => {
      const s = filaASubasta(f)
      return {
        subasta: s,
        oportunidad: evaluarOportunidad(s),
        notasEdicto: f.notas_edicto ?? null,
        tipoBien: f.tipo_bien ?? null,
        esPlaya: f.es_playa ?? false,
        margenFlip: f.margen_flip == null ? null : Number(f.margen_flip),
        margenFlipPct: f.margen_flip_pct == null ? null : Number(f.margen_flip_pct),
        flipApto: f.flip_apto ?? false,
        semaforo: f.semaforo ?? null,
        analisis: f.analisis ?? null,
        documentos: f.documentos ?? null,
        precioM2Zona: f.precio_m2_zona != null ? Number(f.precio_m2_zona) : null,
        muestraZona: f.muestra_zona ?? null,
        zonaPortal: f.zona_portal ?? null,
      }
    })

    return NextResponse.json({
      resultados,
      total: total[0]?.total ?? 0,
      pagina,
      porPagina: POR_PAGINA,
    })
  } catch (e: any) {
    console.error('[api/subastas]', e)
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}
