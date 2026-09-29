import { NextResponse, after } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { cotizar } from '@/lib/codeoscopic/cotizar'
import { completarCoberturasTarificacion, tarificacionACompletar } from '@/lib/codeoscopic/coberturas-tarificacion'
import { prepararRetarificacionNuevaMoto, respuestaRetarificacion, type CuerpoRetarificacion } from '@/lib/retarificar-cartera'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { prepararVariante } from '@/lib/oportunidad-riesgo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// La cotización del vendor puede tardar hasta 150 s (documentado). Sin este
// margen Vercel corta antes y nos quedamos sin saber si nos han cobrado — que
// es justo el estado que el libro de consumo tiene que contar como gasto.
export const maxDuration = 180

/**
 * `POST /api/operador/codeoscopic/moto-nuevo` — presupuesto de MOTO para un
 * cliente que HOY no tiene ninguna póliza (oportunidad nueva), desde
 * `apps/plataforma` → `/correduria`, que es la única pantalla que Alberto abre.
 *
 * **GASTA 0,50€ REALES por llamada.** Hermana de
 * `POST /api/operador/codeoscopic/auto-nuevo` (mismo patrón, catálogo
 * `/motorcycle/*` en vez de `/car/*`): las mismas cuatro salvaguardas, por el
 * mismo motivo — léelas en la cabecera de `/retarificar/route.ts`. Resumen:
 *
 * 1. **`confirmado === true` ESTRICTO** — sin él, 400 y no se llama a nadie.
 * 2. **Solo `POST`.** Este fichero NO exporta `GET`. Lo vigila
 *    `test/regression-asegura-gasto-codeoscopic.test.ts`.
 * 3. **El gasto pasa por `cotizar()`**, el único embudo, llamado AQUÍ.
 * 4. **Aislamiento por correduría** antes de tocar el cliente:
 *    `prepararRetarificacionNuevaMoto()` resuelve `correduriaUnica()` +
 *    `clienteOrigenDe()`, así que un `clienteId` de otra correduría es un
 *    404, no una cotización.
 *
 * A diferencia de una póliza existente, aquí no hay «compañía anterior» que
 * declarar: se cotiza DE CALLE (`aseguradoAntes: false`, ver
 * `precalificarMotoNueva()`), sin el bonus por antigüedad que sí lleva
 * retarificar una póliza real.
 *
 * ── Cuerpo ──────────────────────────────────────────────────────────────────
 *   { clienteId, confirmado: true, solicitadoPor?, resueltos?, correcciones? }
 *
 * ── Respuesta ───────────────────────────────────────────────────────────────
 * La MISMA que `POST /api/operador/codeoscopic/retarificar`, campo por campo
 * (402 tope · 502 vendor · 503 resto · 422 faltan datos · 404 cliente · 409
 * moto no tarifica para la organización), porque la preparan y la redactan
 * las mismas funciones del lib compartido.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>

  // 🚨 El cerrojo del dinero, ANTES de mirar nada más y antes de tocar la BD.
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

  // Quién responde de este cargo. Va al libro de consumo, así que no se inventa
  // un nombre: si plataforma no lo manda, se dice que vino por el puerto.
  const solicitadoPor =
    typeof cuerpo.solicitadoPor === 'string' && cuerpo.solicitadoPor.trim() !== ''
      ? cuerpo.solicitadoPor.trim()
      : 'plataforma'

  // VARIANTE de un riesgo (29/09/2026): con `oportunidadId` se cuelga de ESA oportunidad y las
  // figuras (propietario, conductores) se arman desde sus fichas. Gratis, antes de gastar.
  const correduria = await correduriaUnica().catch(() => null)
  // Con `oportunidadId` y sin poder leer la correduría NO se cotiza: seguir sería pagar con el
  // tomador en todos los papeles y colgarlo de otra oportunidad.
  if (!correduria && typeof cuerpo.oportunidadId === 'string' && cuerpo.oportunidadId.trim() !== '') {
    return NextResponse.json({ estado: 'error', causa: 'variante', mensaje: 'no se pudo comprobar la variante; no se ha pedido precio', gastado: '0,00€' }, { status: 503 })
  }
  const variante = correduria
    ? await prepararVariante(correduria.id, {
        tomadorId: clienteId,
        ramo: 'moto',
        cuerpo,
        correcciones: esObjeto(cuerpo.correcciones) ? cuerpo.correcciones : undefined,
      })
    : { ok: true as const, v: { contexto: null, correcciones: esObjeto(cuerpo.correcciones) ? cuerpo.correcciones : undefined } }
  if (!variante.ok) {
    return NextResponse.json({ estado: 'error', causa: 'variante', mensaje: variante.motivo, gastado: '0,00€' }, { status: 422 })
  }

  const p = await prepararRetarificacionNuevaMoto({
    clienteId,
    solicitadoPor,
    cuerpo: {
      resueltos: esObjeto(cuerpo.resueltos) ? cuerpo.resueltos : undefined,
      correcciones: variante.v.correcciones,
    } satisfies CuerpoRetarificacion,
  })
  // Corta ANTES del vendor (422 faltan datos · 404 cliente · 409 moto no
  // tarifica · 503): esas respuestas llevan `gastado: '0,00€'` y son el caso
  // normal, dado que la cartera viva solo tiene 1 póliza de moto.
  if (p.estado === 'corte') {
    return NextResponse.json(p.respuesta.cuerpo, { status: p.respuesta.status })
  }

  if (variante.v.contexto && p.peticion.contexto) {
    p.peticion.contexto = { ...p.peticion.contexto, ...variante.v.contexto }
  }

  // ── La única línea que cuesta dinero, por el único embudo ────────────────
  const r = await cotizar(p.peticion)
  // Coberturas y garantías de cada precio (GET gratis), DESPUÉS de responder: el precio no espera.
  const aCompletar = tarificacionACompletar(r, p.peticion.correduriaId)
  if (aCompletar) after(() => completarCoberturasTarificacion(aCompletar).then(() => undefined))

  const res = respuestaRetarificacion(r, p)
  return NextResponse.json(res.cuerpo, { status: res.status })
})

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
