import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { esSubcategoriaValida } from '@/lib/categorias-personales'
import { normalizarContraparte } from '@/lib/normalizar-contraparte'

export const dynamic = 'force-dynamic'

// POST /api/finanzas/categorias/asignar
// Reasigna a mano la subcategoría de un gasto personal. Dos modos (SIEMPRE scoped por cuenta_id):
//   { comerciante, subcategoria }  → reetiqueta TODOS los movimientos de ese comercio + aprende regla.
//   { movId, subcategoria }        → reetiqueta un movimiento suelto (excepción; NO aprende regla).
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as { subcategoria?: string; comerciante?: string; movId?: string } | null
  const subcategoria = (body?.subcategoria || '').trim()
  if (!esSubcategoriaValida(subcategoria)) {
    return NextResponse.json({ error: 'Subcategoría no válida' }, { status: 400 })
  }

  const scope = Prisma.sql`
    cuenta_bancaria_id IN (SELECT id FROM cuentas_bancarias WHERE cuenta_id = ${session.id}::uuid)
    AND COALESCE(duplicado_estado, '') <> 'ignorado'`

  try {
    // ── Un movimiento concreto ──────────────────────────────────────────────
    if (body?.movId) {
      const updated = await prisma.$executeRaw(Prisma.sql`
        UPDATE movimientos_bancarios
        SET subcategoria = ${subcategoria}, requiere_revision = false, subcategoria_revisar = false
        WHERE id = ${body.movId}::uuid AND ${scope}`)
      return NextResponse.json({ updated })
    }

    // ── Todos los movimientos de un comercio + regla aprendida ──────────────
    if (typeof body?.comerciante === 'string') {
      const comerciante = body.comerciante
      // Mismo agrupado que getMerchantsForCategoria: contraparte TRIM, NULL/'' → 'Sin identificar'.
      const updated = await prisma.$executeRaw(Prisma.sql`
        UPDATE movimientos_bancarios
        SET subcategoria = ${subcategoria}, requiere_revision = false, subcategoria_revisar = false
        WHERE ${scope}
          AND importe < 0
          AND COALESCE(destino, 'personal') = 'personal'
          AND COALESCE(NULLIF(TRIM(contraparte), ''), 'Sin identificar') = ${comerciante}`)

      // Aprende la regla para que futuros cargos del mismo comercio se autoclasifiquen.
      const clave = normalizarContraparte(comerciante)
      if (clave) {
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO banca_destino_reglas (cuenta_id, clave, destino, subcategoria)
          VALUES (${session.id}::uuid, ${clave}, 'personal', ${subcategoria})
          ON CONFLICT (cuenta_id, clave) DO UPDATE SET subcategoria = EXCLUDED.subcategoria`)
      }
      return NextResponse.json({ updated, reglaAprendida: Boolean(clave) })
    }

    return NextResponse.json({ error: 'Indica comerciante o movId' }, { status: 400 })
  } catch (e) {
    console.error('[/api/finanzas/categorias/asignar]', e)
    return NextResponse.json({ error: 'No se pudo reasignar' }, { status: 500 })
  }
}
