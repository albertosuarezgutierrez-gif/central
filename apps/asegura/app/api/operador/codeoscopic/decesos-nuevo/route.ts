import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { cotizar } from '@/lib/codeoscopic/cotizar'
import { prepararRetarificacionNuevaDecesos, respuestaRetarificacion, type CuerpoRetarificacion } from '@/lib/retarificar-cartera'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

/**
 * `POST /api/operador/codeoscopic/decesos-nuevo` — presupuesto de DECESOS para
 * un cliente que HOY no tiene ninguna póliza (0 en cartera, 03/09/2026).
 * Hermana de `vida-nuevo`: mismas cuatro salvaguardas. **GASTA 0,50€ REALES.**
 *
 * 🚧 **El `risk` de `BurialRisk` NO está verificado contra el fabricante**
 * (ver `lib/codeoscopic/peticion-decesos.ts`), y solo cubre al tomador como
 * único asegurado (sin cobertura familiar, ver cabecera de ese fichero). El
 * primer intento real puede devolver un 400 que nombre un campo distinto.
 *
 * ── Cuerpo ──────────────────────────────────────────────────────────────────
 *   { clienteId, confirmado: true, solicitadoPor?, resueltos?, correcciones? }
 */
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>

  if (cuerpo.confirmado !== true) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'sin_confirmar',
        mensaje:
          'Esta llamada cuesta 0,50€ reales. Hay que mandar `confirmado: true` (booleano) para ' +
          'pedirla: sin esa confirmación explícita no se llama a Codeoscopic.',
        gastado: '0,00€',
      },
      { status: 400 },
    )
  }

  const clienteId = typeof cuerpo.clienteId === 'string' ? cuerpo.clienteId.trim() : ''
  if (clienteId === '') {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'falta clienteId', gastado: '0,00€' },
      { status: 400 },
    )
  }

  const solicitadoPor =
    typeof cuerpo.solicitadoPor === 'string' && cuerpo.solicitadoPor.trim() !== ''
      ? cuerpo.solicitadoPor.trim()
      : 'plataforma'

  const p = await prepararRetarificacionNuevaDecesos({
    clienteId,
    solicitadoPor,
    cuerpo: {
      resueltos: esObjeto(cuerpo.resueltos) ? cuerpo.resueltos : undefined,
      correcciones: esObjeto(cuerpo.correcciones) ? cuerpo.correcciones : undefined,
    } satisfies CuerpoRetarificacion,
  })
  if (p.estado === 'corte') {
    return NextResponse.json(p.respuesta.cuerpo, { status: p.respuesta.status })
  }

  const r = await cotizar(p.peticion)
  const res = respuestaRetarificacion(r, p)
  return NextResponse.json(res.cuerpo, { status: res.status })
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
