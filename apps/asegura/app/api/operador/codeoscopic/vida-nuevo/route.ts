import { NextResponse, after } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { cotizar } from '@/lib/codeoscopic/cotizar'
import { completarCoberturasTarificacion, tarificacionACompletar } from '@/lib/codeoscopic/coberturas-tarificacion'
import { prepararRetarificacionNuevaVida, respuestaRetarificacion, type CuerpoRetarificacion } from '@/lib/retarificar-cartera'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { anotarCapitalDeCotizacion, prepararVariante } from '@/lib/oportunidad-riesgo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

/**
 * `POST /api/operador/codeoscopic/vida-nuevo` — presupuesto de VIDA para un
 * cliente que HOY no tiene ninguna póliza (0 en cartera, 03/09/2026), desde
 * `apps/plataforma` → `/correduria`. Hermana de `moto-nuevo`: mismas cuatro
 * salvaguardas (confirmado estricto · solo POST · gasto único por `cotizar()`
 * · aislamiento por correduría). **GASTA 0,50€ REALES por llamada.**
 *
 * 🚧 **El `risk` de `TermLifeRisk` NO está verificado contra el fabricante**
 * (ver `lib/codeoscopic/peticion-vida.ts`). Construido a propósito de Alberto
 * el 07/09/2026 con lo que hay documentado del portal, que es solo el prefijo
 * `/term-life/*`. El primer intento real puede devolver un 400 que nombre un
 * campo distinto: se lee y se corrige en `peticion-vida.ts`, no se reintenta.
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
        ramo: 'vida',
        cuerpo,
        correcciones: esObjeto(cuerpo.correcciones) ? cuerpo.correcciones : undefined,
      })
    : { ok: true as const, v: { contexto: null, correcciones: esObjeto(cuerpo.correcciones) ? cuerpo.correcciones : undefined } }
  if (!variante.ok) {
    return NextResponse.json({ estado: 'error', causa: 'variante', mensaje: variante.motivo, gastado: '0,00€' }, { status: 422 })
  }

  const p = await prepararRetarificacionNuevaVida({
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

  const r = await cotizar(p.peticion)
  // Lo usado para pedir precio se anota en el riesgo (`info_riesgo.datosCapital`), DESPUÉS de guardar la
  // tarificación. Nunca lanza: la cotización ya está pagada (0,50€, no idempotente, regla 20).
  if (correduria && variante.v.contexto && r.ok && r.guardado.estado === 'guardada') {
    await anotarCapitalDeCotizacion(correduria.id, { oportunidadId: variante.v.contexto.oportunidadId, ramo: 'vida', cuerpo, actor: solicitadoPor })
  }
  // Coberturas y garantías de cada precio (GET gratis), DESPUÉS de responder: el precio no espera.
  const aCompletar = tarificacionACompletar(r, p.peticion.correduriaId)
  if (aCompletar) after(() => completarCoberturasTarificacion(aCompletar).then(() => undefined))
  const res = respuestaRetarificacion(r, p)
  return NextResponse.json(res.cuerpo, { status: res.status })
})

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
