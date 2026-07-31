// Puntos para el mapa nacional de subastas: las vigentes con coordenadas —
// exactas del Catastro o aproximadas al centro del municipio, cada una marcada
// con su precisión. Las que ni eso se cuentan aparte, para que el mapa no
// parezca completo cuando no lo es.
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireEmpresaId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

// Tope generoso: el corpus crece a unas pocas subastas al día y las cerradas
// salen del filtro; muy por debajo de lo que Leaflet pinta sin despeinarse.
const MAX_PUNTOS = 1000

export async function GET() {
  let cuentaId: string
  try {
    cuentaId = await requireEmpresaId()
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  try {
    const vigente = Prisma.sql`es_inmueble = true AND (fecha_fin IS NULL OR fecha_fin >= now())`
    const [filas, sinUbicar, ubicadas, radar] = await Promise.all([
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT dedupe_key, identificador, tipo_bien, provincia, municipio,
               direccion, direccion_catastro, ref_catastral,
               valor_subasta, fecha_fin, url, lat, lon, geo_precision, situacion_posesoria
        FROM subastas
        WHERE ${vigente} AND lat IS NOT NULL AND lon IS NOT NULL
        ORDER BY fecha_fin ASC NULLS LAST
        LIMIT ${MAX_PUNTOS}
      `),
      prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS total FROM subastas WHERE ${vigente} AND (lat IS NULL OR lon IS NULL)
      `),
      prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS total FROM subastas WHERE ${vigente} AND lat IS NOT NULL AND lon IS NOT NULL
      `),
      prisma.$queryRaw<{ dedupe_key: string }[]>(Prisma.sql`
        SELECT dedupe_key FROM subastas_radar
        WHERE cuenta_id = ${cuentaId}::uuid AND descartado = false
      `),
    ])

    const enRadar = new Set(radar.map((r) => r.dedupe_key))
    const puntos = filas.map((f) => ({
      dedupeKey: f.dedupe_key,
      identificador: f.identificador ?? null,
      tipoBien: f.tipo_bien ?? null,
      provincia: f.provincia ?? null,
      municipio: f.municipio ?? null,
      direccion: f.direccion ?? null,
      direccionCatastro: f.direccion_catastro ?? null,
      refCatastral: f.ref_catastral ?? null,
      valorSubasta: f.valor_subasta == null ? null : Number(f.valor_subasta),
      fechaFin: f.fecha_fin ? new Date(f.fecha_fin).toISOString() : null,
      url: f.url ?? null,
      lat: Number(f.lat),
      lon: Number(f.lon),
      aproximado: f.geo_precision === 'municipio',
      ocupada: f.situacion_posesoria === 'ocupada' || f.situacion_posesoria === 'ocupada_desconocida',
      enRadar: enRadar.has(f.dedupe_key),
    }))

    // `omitidos`: lo que el `LIMIT` deja fuera. Sin este dato el pie del mapa
    // afirmaría «N con ubicación exacta» contando solo lo que le llegó, que al
    // pasar del tope sería mentira (y silenciosa).
    const omitidos = Math.max(0, (ubicadas[0]?.total ?? 0) - puntos.length)
    return NextResponse.json({ puntos, sinUbicar: sinUbicar[0]?.total ?? 0, omitidos })
  } catch (e: any) {
    console.error('[api/subastas/mapa]', e)
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}
