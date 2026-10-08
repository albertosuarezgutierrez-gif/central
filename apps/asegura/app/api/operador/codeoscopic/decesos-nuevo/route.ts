import { NextResponse, after } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { cotizar } from '@/lib/codeoscopic/cotizar'
import { completarCoberturasTarificacion, tarificacionACompletar } from '@/lib/codeoscopic/coberturas-tarificacion'
import { prepararPresupuestoTrasTarificar } from '@/lib/presupuesto-tras-tarificar'
import { prepararRetarificacionNuevaDecesos, respuestaRetarificacion, type CuerpoRetarificacion } from '@/lib/retarificar-cartera'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { anotarCapitalDeCotizacion, prepararVariante } from '@/lib/oportunidad-riesgo'

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
export const POST = auditado(async (req: Request) => {
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

  // VARIANTE de un riesgo (30/09/2026): con `oportunidadId` la tarificación se cuelga de ESA oportunidad (regla 9).
  // Sin `oportunidadId` el camino es el de siempre, idéntico. Gratis, antes de gastar.
  const oportunidadPedida = typeof cuerpo.oportunidadId === 'string' && cuerpo.oportunidadId.trim() !== ''
  const correduria = oportunidadPedida ? await correduriaUnica().catch(() => null) : null
  if (!correduria && oportunidadPedida) {
    return NextResponse.json({ estado: 'error', causa: 'variante', mensaje: 'no se pudo comprobar la variante; no se ha pedido precio', gastado: '0,00€' }, { status: 503 })
  }
  const variante = correduria
    ? await prepararVariante(correduria.id, {
        tomadorId: clienteId,
        ramo: 'decesos',
        cuerpo,
        correcciones: esObjeto(cuerpo.correcciones) ? cuerpo.correcciones : undefined,
      })
    : { ok: true as const, v: { contexto: null, correcciones: esObjeto(cuerpo.correcciones) ? cuerpo.correcciones : undefined } }
  if (!variante.ok) {
    return NextResponse.json({ estado: 'error', causa: 'variante', mensaje: variante.motivo, gastado: '0,00€' }, { status: 422 })
  }

  const p = await prepararRetarificacionNuevaDecesos({
    clienteId,
    solicitadoPor,
    cuerpo: {
      resueltos: esObjeto(cuerpo.resueltos) ? cuerpo.resueltos : undefined,
      correcciones: variante.v.correcciones,
    } satisfies CuerpoRetarificacion,
  })
  if (p.estado === 'corte') {
    return NextResponse.json(p.respuesta.cuerpo, { status: p.respuesta.status })
  }

  if (variante.v.contexto && p.peticion.contexto) {
    p.peticion.contexto = { ...p.peticion.contexto, ...variante.v.contexto }
  }

  // Recotización explícita: salta la guarda anti-duplicado (15 min) SOLO si el operador la pide; nunca por defecto.
  if (cuerpo.forzar === true) p.peticion.forzar = true
  const r = await cotizar(p.peticion)
  // Lo usado para pedir precio se anota en el riesgo (`info_riesgo.datosCapital`), DESPUÉS de guardar la
  // tarificación. Nunca lanza: la cotización ya está pagada (0,50€, no idempotente, regla 20).
  if (correduria && variante.v.contexto && r.ok && r.guardado.estado === 'guardada') {
    await anotarCapitalDeCotizacion(correduria.id, { oportunidadId: variante.v.contexto.oportunidadId, ramo: 'decesos', cuerpo, actor: solicitadoPor })
  }
  // Coberturas y garantías de cada precio (GET gratis), DESPUÉS de responder: el precio no espera.
  const aCompletar = tarificacionACompletar(r, p.peticion.correduriaId)
  if (aCompletar) after(() => completarCoberturasTarificacion(aCompletar).then(() => prepararPresupuestoTrasTarificar(aCompletar, solicitadoPor)).then(() => undefined))
  const res = respuestaRetarificacion(r, p)
  return NextResponse.json(res.cuerpo, { status: res.status })
})

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
