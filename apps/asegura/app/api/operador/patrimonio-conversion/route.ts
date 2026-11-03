import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { leerDesdeMes } from '@/lib/patrimonio-conversion-reglas'
import { leerPatrimonioConversion } from '@/lib/patrimonio-conversion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Panel de conversión de Patrimonio de /correduria (27/10/2026). SOLO LECTURA.
 *
 *   GET ?desdeMes=<ISO> → { estado:'ok', titulares } · { estado:'sin_configurar' } · { estado:'sin_correduria' } ·
 *                         422 { estado:'invalida' } (falta/ilegible `desdeMes`) · 500 { estado:'error', causa }
 *
 * Contrato: cabecera de `apps/plataforma/lib/correduria/patrimonio-conversion.ts`. `null` = «no se sabe» (columna sin aplicar,
 * lectura fallida), nunca 0. Sin PII: id, nombre visible y cifras.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const desdeMes = leerDesdeMes(new URL(req.url).searchParams.get('desdeMes'))
  if (!desdeMes) return NextResponse.json({ estado: 'invalida', motivo: 'desdeMes ausente o no es una fecha ISO' }, { status: 422 })
  try {
    return NextResponse.json(await leerPatrimonioConversion(desdeMes))
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/patrimonio-conversion', e) }, { status: 500 })
  }
}
