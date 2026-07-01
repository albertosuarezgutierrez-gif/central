import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { claveReferencia, claveComercio } from '@/lib/correduria'

export const dynamic = 'force-dynamic'

const TIPOS_VALIDOS = ['mecenazgo', 'guarderia', 'deportiva_and'] as const
type DeduccionCuotaTipo = typeof TIPOS_VALIDOS[number]

// POST /api/banca/deduccion-cuota { id, tipo }
// Marca un movimiento con su tipo de deducción de cuota IRPF (o lo quita con tipo=null).
// Aprende la regla por clave de comercio y re-aplica a todos los iguales del año.
// Sincroniza fiscal_perfil con los totales del año para que calcularDeducciones sea preciso.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, tipo } = await req.json().catch(() => ({})) as { id?: string; tipo?: string | null }
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  if (tipo !== null && tipo !== undefined && !TIPOS_VALIDOS.includes(tipo as DeduccionCuotaTipo)) {
    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  }

  const rows = await prisma.$queryRaw<Array<{
    id: string; concepto: string | null; fecha_operacion: Date | null
  }>>`
    SELECT mb.id, mb.concepto, mb.fecha_operacion
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE mb.id = ${id}::uuid AND cb.cuenta_id = ${session.id}::uuid
    LIMIT 1
  `
  if (!rows.length) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const mov = rows[0]
  const year = mov.fecha_operacion ? mov.fecha_operacion.getFullYear() : new Date().getFullYear()

  // Actualizar el movimiento
  await prisma.$executeRaw`
    UPDATE movimientos_bancarios SET deduccion_cuota_tipo = ${tipo ?? null}
    WHERE id = ${id}::uuid
  `

  // Aprender la regla por clave (comercio o referencia) y re-aplicar a todos los iguales
  const clave = claveReferencia(mov.concepto) ?? claveComercio(mov.concepto)
  if (clave) {
    await prisma.$executeRaw`
      INSERT INTO banca_destino_reglas (cuenta_id, clave, destino, deduccion_cuota_tipo)
      VALUES (${session.id}::uuid, ${clave}, 'personal', ${tipo ?? null})
      ON CONFLICT (cuenta_id, clave) DO UPDATE SET deduccion_cuota_tipo = EXCLUDED.deduccion_cuota_tipo
    `
    // Bulk-update movimientos del mismo comercio del mismo año (sin tocar el destino)
    await prisma.$executeRaw`
      UPDATE movimientos_bancarios mb
      SET deduccion_cuota_tipo = ${tipo ?? null}
      FROM cuentas_bancarias cb
      WHERE cb.id = mb.cuenta_bancaria_id
        AND cb.cuenta_id = ${session.id}::uuid
        AND mb.concepto ILIKE ${'%' + clave + '%'}
        AND EXTRACT(year FROM mb.fecha_operacion) = ${year}
        AND mb.id <> ${id}::uuid
    `
  }

  // Sincronizar fiscal_perfil con los totales del año
  await sincronizarPerfilDesdeBanca(session.id, year)

  return NextResponse.json({ ok: true })
}

// Suma los movimientos etiquetados por tipo y actualiza fiscal_perfil.
async function sincronizarPerfilDesdeBanca(cuentaId: string, year: number): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ tipo: string; total: unknown }>>`
    SELECT mb.deduccion_cuota_tipo AS tipo, SUM(ABS(mb.importe)) AS total
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND mb.deduccion_cuota_tipo IS NOT NULL
      AND mb.importe < 0
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
      AND EXTRACT(year FROM mb.fecha_operacion) = ${year}
    GROUP BY mb.deduccion_cuota_tipo
  `
  const t: Record<string, number> = {}
  for (const r of rows) t[r.tipo] = Number(r.total)

  // UPSERT: si no existe el perfil, lo crea con solo estos campos (el resto tiene defaults).
  await prisma.$executeRaw`
    INSERT INTO fiscal_perfil (cuenta_id, donativos_anual, gasto_guarderia_anual, gasto_deportivo_anual)
    VALUES (${cuentaId}::uuid, ${t.mecenazgo ?? 0}, ${t.guarderia ?? 0}, ${t.deportiva_and ?? 0})
    ON CONFLICT (cuenta_id) DO UPDATE SET
      donativos_anual       = EXCLUDED.donativos_anual,
      gasto_guarderia_anual = EXCLUDED.gasto_guarderia_anual,
      gasto_deportivo_anual = EXCLUDED.gasto_deportivo_anual
  `
}
