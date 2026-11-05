import { NextResponse } from 'next/server'
import { autorizacionBearerValida } from '@central/core-identity'
import { generarBorradores, periodoActual } from '@/lib/nominas'
import { empresasConNominasEnCalculo } from '@/lib/modulos-empresa'

export const maxDuration = 60

// Solo empresas con el módulo `nominas` ACTIVO en modo 'calculo' (rrhh.empresa_modulos, migración 0031). Antes recorría TODAS.
// Si la tabla no se puede leer, no se procesa NINGUNA (fail-closed) y se devuelve 500 para que se vea en los logs.
export async function GET(req: Request) {
  if (!autorizacionBearerValida(req, 'CRON_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const periodo = periodoActual()
  let empresas: string[]
  try {
    empresas = await empresasConNominasEnCalculo()
  } catch (e) {
    console.error('[cron/nominas] no se pudo leer empresa_modulos; no se procesa ninguna empresa', e instanceof Error ? e.message : e)
    return NextResponse.json({ periodo, error: 'empresa_modulos ilegible' }, { status: 500 })
  }

  const resultados: Array<{ empresa_id: string; creadas: number; omitidas: number; errores: number; error?: string }> = []
  for (const id of empresas) {
    try {
      const r = await generarBorradores(id, periodo, 'calculo')
      resultados.push({ empresa_id: id, creadas: r.creadas, omitidas: r.omitidas, errores: r.errores.length })
      if (r.errores.length) console.warn('[cron/nominas] contratos sin calcular', id, r.errores)
    } catch (e) {
      resultados.push({ empresa_id: id, creadas: 0, omitidas: 0, errores: 0, error: e instanceof Error ? e.message : String(e) })
    }
  }

  console.log('[cron/nominas]', periodo, resultados)
  return NextResponse.json({ periodo, resultados })
}
