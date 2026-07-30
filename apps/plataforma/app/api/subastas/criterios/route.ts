// Criterios del radar de subastas, por cuenta.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireEmpresaId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/** Tanto por uno guardado → % para la UI. (No exportar: `route.ts` solo admite handlers.) */
function pct(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 10000) / 100 : null
}

export async function GET() {
  let cuentaId: string
  try {
    cuentaId = await requireEmpresaId()
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT * FROM subastas_criterios WHERE cuenta_id = ${cuentaId}::uuid
  `)
  const f = filas[0]
  return NextResponse.json({
    criterios: {
      activo: f?.activo ?? false,
      provincias: f?.provincias ?? [],
      palabras_clave: f?.palabras_clave ?? [],
      tipos: f?.tipos ?? [],
      precio_min: f?.precio_min == null ? null : Number(f.precio_min),
      precio_max: f?.precio_max == null ? null : Number(f.precio_max),
      descuento_min: f?.descuento_min ?? 0,
      excluir_ocupadas: f?.excluir_ocupadas ?? false,
      // Coste del dinero (art. 670 LEC). Sin declarar = se paga al contado.
      // En BD van en tanto por uno (lo que consume el módulo); al exterior
      // salen en % porque es como se teclean y se leen.
      financia_pct: pct(f?.financia_pct),
      financia_tipo_anual: pct(f?.financia_tipo_anual),
      financia_meses: f?.financia_meses == null ? null : Number(f.financia_meses),
      financia_comision: pct(f?.financia_comision),
    },
  })
}

export async function PUT(req: NextRequest) {
  let cuentaId: string
  try {
    cuentaId = await requireEmpresaId()
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const b = await req.json()
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : [])
  const num = (v: unknown): number | null => {
    const n = Number(v)
    return v === null || v === '' || !Number.isFinite(n) ? null : n
  }

  // Los porcentajes llegan de la UI en % (70, 8, 1) y se guardan en tanto por
  // uno, que es lo que consume el módulo. Fuera de rango = no declarado (null),
  // nunca un valor absurdo que infle el coste en silencio.
  const tantoPorUno = (v: unknown, maxPct: number): number | null => {
    const n = num(v)
    if (n == null || n <= 0 || n > maxPct) return null
    return n / 100
  }

  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO subastas_criterios
        (cuenta_id, activo, provincias, palabras_clave, tipos, precio_min, precio_max, descuento_min, excluir_ocupadas,
         financia_pct, financia_tipo_anual, financia_meses, financia_comision)
      VALUES (
        ${cuentaId}::uuid, ${!!b.activo}, ${arr(b.provincias)}::text[], ${arr(b.palabras_clave)}::text[],
        ${arr(b.tipos)}::text[], ${num(b.precio_min)}, ${num(b.precio_max)},
        ${Math.max(0, Math.min(100, Number(b.descuento_min) || 0))}, ${!!b.excluir_ocupadas},
        ${tantoPorUno(b.financia_pct, 100)}, ${tantoPorUno(b.financia_tipo_anual, 60)},
        ${(() => { const n = num(b.financia_meses); return n != null && n > 0 && n <= 36 ? Math.round(n) : null })()},
        ${tantoPorUno(b.financia_comision, 10)}
      )
      ON CONFLICT (cuenta_id) DO UPDATE SET
        activo = EXCLUDED.activo,
        provincias = EXCLUDED.provincias,
        palabras_clave = EXCLUDED.palabras_clave,
        tipos = EXCLUDED.tipos,
        precio_min = EXCLUDED.precio_min,
        precio_max = EXCLUDED.precio_max,
        descuento_min = EXCLUDED.descuento_min,
        excluir_ocupadas = EXCLUDED.excluir_ocupadas,
        financia_pct = EXCLUDED.financia_pct,
        financia_tipo_anual = EXCLUDED.financia_tipo_anual,
        financia_meses = EXCLUDED.financia_meses,
        financia_comision = EXCLUDED.financia_comision,
        actualizado_en = now()
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[api/subastas/criterios]', e)
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}
