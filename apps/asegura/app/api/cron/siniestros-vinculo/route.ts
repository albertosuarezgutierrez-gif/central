import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { reconciliarSiniestros } from '@/lib/siniestros-vinculo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/cron/siniestros-vinculo — reconciliación parte ↔ siniestro ↔ CIMA
 * (03/10/2026). Horaria (`vercel.json`): la ingesta de CIMA vive en el repo
 * `asegura` y escribe en la misma BD; esto corre DESPUÉS sobre lo que ya entró.
 *
 *   1. Funde el alta manual con el siniestro de CIMA que le corresponde (mismo
 *      nº, o póliza + fecha única) sin borrar nada.
 *   2. Vincula los partes del portal con coincidencia FUERTE (misma póliza,
 *      fecha ±3 días, un único candidato de CIMA). Lo ambiguo NO se toca: queda
 *      como sugerencia en la ficha.
 *
 * Auth: `CRON_SECRET` por `Authorization: Bearer`. No escribe a nadie de fuera:
 * sin modo cuenta. Idempotente.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = await reconciliarSiniestros(correduria.id)
    return NextResponse.json({
      estado: 'ok',
      fusionados: r.fusionados.length,
      vinculados: r.vinculados.length,
      fusionesOmitidas: r.fusionesOmitidas,
      partesPendientes: r.partesPendientes,
    })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('cron/siniestros-vinculo', e) }, { status: 500 })
  }
}
