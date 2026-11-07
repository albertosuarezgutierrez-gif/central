import { NextResponse } from 'next/server'
import { autorizacionBearerValida } from '@central/core-identity'
import { enviarHechosNominas, leerConfigContabilidad } from '@/lib/enviar-hechos-nominas'
import { leerColaHechosNominas, marcarHechoNomina } from '@/lib/hechos-nominas'

export const maxDuration = 60

// N3: envía a contabilidad el outbox de nóminas confirmadas (solo empresas con `contabilidad_nominas` activo). Solo contadores en la respuesta.
export async function GET(req: Request) {
  if (!autorizacionBearerValida(req, 'CRON_SECRET')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const r = await enviarHechosNominas({
      config: leerConfigContabilidad(),
      leerCola: leerColaHechosNominas,
      marcar: marcarHechoNomina,
      fetch: (url, init) => fetch(url, init),
      ahora: () => new Date(),
    })
    return NextResponse.json({ ok: r.errores === 0, ...r })
  } catch (e) {
    console.error('[cron/enviar-hechos-nominas]', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, error: 'cola ilegible' }, { status: 500 })
  }
}
