import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { resolverConfig, explicarConfig } from '@/lib/codeoscopic/config'
import { lineasDeSeguro, hogarDisponible } from '@/lib/codeoscopic/catalogos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/operador/codeoscopic/lineas — los ramos que Codeoscopic tarifica
 * para nuestra organización, y si HOGAR está entre ellos.
 *
 * **No gasta ninguna cotización**: `GET /insurance-lines` es un catálogo. Por
 * eso corre, como la sonda, con `CODEOSCOPIC_TARIFICACION_ACTIVA` apagado —
 * es la comprobación previa a construir el ramo de hogar, y no hay que pagar
 * 0,50€ ni escribir un email para saberlo.
 *
 * Tres estados en `hogar`: `disponible` (con el id exacto del vendor) ·
 * `ausente` (la lista llegó y no está) · `desconocido` (no se pudo mirar).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }
  const r = resolverConfig(process.env, { ignorarInterruptor: true })
  if (r.estado !== 'lista') {
    return NextResponse.json(
      { estado: 'sin_configurar', mensaje: explicarConfig(r), hogar: { estado: 'desconocido' } },
      { status: 200 },
    )
  }
  try {
    const lineas = await lineasDeSeguro(r.config)
    return NextResponse.json({ estado: 'ok', lineas, hogar: hogarDisponible(lineas), gastado: '0,00€' })
  } catch (e) {
    return NextResponse.json(
      {
        estado: 'error',
        mensaje: e instanceof Error ? e.message : String(e),
        hogar: { estado: 'desconocido' },
      },
      { status: 502 },
    )
  }
}
