import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { comercioDe } from '@/lib/comercio'
import { bancoCond } from '@/lib/finanzas'

export const dynamic = 'force-dynamic'

type MovRow = { id: string; fecha: string; concepto: string | null; importe: number; subcategoria: string | null; subcategoria_revisar: boolean }

// GET /api/finanzas/categorias/movimientos — lista movimientos de gasto personal. Modos:
//   ?comerciante=..&categoria=..  → los de un comercio DENTRO de una subcategoría (drill-down)
//   ?sin=1                        → los que están SIN categoría (subcategoria IS NULL)
//   ?orden=importe                → sin clasificar (NULL u 'otros_gasto') de MAYOR importe
//   ?revisar=1                    → los marcados por la IA para revisar, TODAS las fechas
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') ?? 'fiscal_year'
  const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear()
  const month = parseInt(searchParams.get('month') || '') || new Date().getMonth() + 1
  const comerciante = searchParams.get('comerciante')
  const categoria = searchParams.get('categoria')
  const sin = searchParams.get('sin') === '1'
  const grandes = searchParams.get('orden') === 'importe'
  const revisar = searchParams.get('revisar') === '1'
  // Cola unificada "Necesitan tu atención": sin clasificar (NULL/otros_gasto) O dudosos (IA marcó
  // subcategoria_revisar). Backlog sin fechas, ordenado por importe. Fusiona los 3 paneles antiguos.
  const atencion = searchParams.get('atencion') === '1'
  // Filtro por cuenta (BBVA = 100% de Alberto · familiar = resto/Kutxabank). Vacío = todo junto.
  const banco = bancoCond(searchParams.get('banco') ?? undefined)

  if (!comerciante && !sin && !grandes && !revisar && !atencion) {
    return NextResponse.json({ error: 'Indica comerciante, sin=1, orden=importe, revisar=1 o atencion=1' }, { status: 400 })
  }

  // Rango de fechas explícito de la pestaña Categorías (manda sobre year/mode si es válido).
  const ISO = /^\d{4}-\d{2}-\d{2}$/
  const desdeParam = searchParams.get('desde')
  const hastaParam = searchParams.get('hasta')

  let desde: string, hasta: string
  if (desdeParam && hastaParam && ISO.test(desdeParam) && ISO.test(hastaParam)) {
    desde = desdeParam
    hasta = hastaParam
  } else if (mode === 'rolling_12') {
    hasta = new Date(year, month, 0).toISOString().slice(0, 10)
    desde = new Date(year, month - 12, 1).toISOString().slice(0, 10)
  } else {
    desde = `${year}-01-01`
    hasta = `${year}-12-31`
  }

  try {
    // ── Modo comercio: acota a la subcategoría del drill-down (bug del "2 ops") y casa el comercio
    // por `comercioDe` (mismo criterio que el agrupado → incluye los derivados del concepto). ────────
    if (comerciante) {
      if (!categoria) return NextResponse.json({ error: 'Falta categoria' }, { status: 400 })
      const filas = await prisma.$queryRaw<Array<{ id: string; fecha: string; concepto_normalizado: string | null; concepto: string | null; contraparte: string | null; importe: number; subcategoria_revisar: boolean }>>(Prisma.sql`
        SELECT mb.id::text AS id, mb.fecha_operacion::text AS fecha,
               mb.concepto_normalizado, mb.concepto, mb.contraparte,
               mb.importe::float8 AS importe,
               COALESCE(mb.subcategoria_revisar, false) AS subcategoria_revisar
        FROM movimientos_bancarios mb
        JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
        WHERE cb.cuenta_id = ${session.id}::uuid
          AND mb.importe < 0
          AND COALESCE(mb.destino, 'personal') = 'personal'
          AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
          AND mb.subcategoria = ${categoria}
          AND mb.fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
          ${banco}
        ORDER BY mb.fecha_operacion DESC`)
      const rows: MovRow[] = filas
        .filter(f => comercioDe(f.contraparte, f.concepto) === comerciante)
        .slice(0, 100)
        .map(f => ({
          id: f.id, fecha: f.fecha,
          concepto: f.concepto_normalizado ?? f.concepto ?? f.contraparte,
          importe: f.importe, subcategoria: categoria, subcategoria_revisar: f.subcategoria_revisar,
        }))
      return NextResponse.json({ movimientos: rows })
    }

    // ── Modos sin clasificar / revisar / atención: SQL directo. ─────────────────────────────────────
    const filtro = atencion
      ? Prisma.sql`AND (mb.subcategoria IS NULL OR mb.subcategoria = 'otros_gasto' OR mb.subcategoria_revisar = true)`
      : revisar
        ? Prisma.sql`AND mb.subcategoria_revisar = true`
        : grandes
          ? Prisma.sql`AND (mb.subcategoria IS NULL OR mb.subcategoria = 'otros_gasto')`
          : Prisma.sql`AND mb.subcategoria IS NULL`

    // La cola de atención/revisión es un backlog: NO se acota por fechas (para poder vaciarlo). El resto sí.
    const filtroFecha = (revisar || atencion)
      ? Prisma.empty
      : Prisma.sql`AND mb.fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date`

    const orden = (grandes || revisar || atencion)
      ? Prisma.sql`ORDER BY ABS(mb.importe) DESC`
      : Prisma.sql`ORDER BY mb.fecha_operacion DESC`
    const limite = grandes ? 10 : atencion ? 50 : 100

    const rows = await prisma.$queryRaw<MovRow[]>(Prisma.sql`
      SELECT mb.id::text AS id,
             mb.fecha_operacion::text AS fecha,
             COALESCE(mb.concepto_normalizado, mb.concepto, mb.contraparte) AS concepto,
             mb.importe::float8 AS importe,
             mb.subcategoria,
             COALESCE(mb.subcategoria_revisar, false) AS subcategoria_revisar
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${session.id}::uuid
        AND mb.importe < 0
        AND COALESCE(mb.destino, 'personal') = 'personal'
        AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
        ${filtroFecha}
        ${filtro}
        ${banco}
      ${orden}
      LIMIT ${limite}`)
    return NextResponse.json({ movimientos: rows })
  } catch (e) {
    console.error('[/api/finanzas/categorias/movimientos]', e)
    return NextResponse.json({ error: 'Error al cargar movimientos' }, { status: 500 })
  }
}
