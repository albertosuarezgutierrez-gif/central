import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { cotizar } from '@/lib/codeoscopic/cotizar'
import {
  prepararRetarificacion,
  respuestaRetarificacion,
  type CuerpoRetarificacion,
} from '@/lib/retarificar-cartera'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// La cotización del vendor puede tardar hasta 150 s (documentado). Sin este
// margen Vercel corta antes y nos quedamos sin saber si nos han cobrado — que
// es justo el estado que el libro de consumo tiene que contar como gasto.
export const maxDuration = 180

/**
 * `POST /api/operador/codeoscopic/retarificar` — retarificar una póliza desde
 * `apps/plataforma` → `/correduria`, que es la única pantalla que Alberto abre.
 *
 * 🚨 **ESTA RUTA GASTA 0,50€ REALES POR LLAMADA, y es la primera del puerto que
 * gasta dinero en un tercero.** Todo lo demás de `/api/operador/*` lee la
 * cartera o escribe en nuestra propia BD; aquí se llama a Codeoscopic y se
 * factura. Eso cambia lo que significa tener el Bearer.
 *
 * ── Las cuatro salvaguardas, y por qué cada una ──────────────────────────────
 *
 * 1. **`confirmado === true` ESTRICTO** (el booleano, no `"true"` ni `1`). El
 *    permiso de `lib/operador.ts` es un secreto compartido que **no distingue
 *    método ni intención**: quien lo tenga puede llamar aquí. En `apps/asegura`
 *    lo que impedía un cargo accidental era una pantalla de confirmación detrás
 *    de una sesión propia; al servir la operación por el puerto esa pantalla
 *    desaparece, y este campo es su sustituto — la afirmación explícita, en el
 *    cuerpo, de que alguien ha decidido pagar. Sin él: **400 y no se llama a
 *    nadie**. Se compara con `===` a propósito: un `"false"` de un formulario
 *    es una cadena no vacía y sería `true` en cualquier comprobación laxa.
 *
 * 2. **Solo `POST`.** Este fichero NO exporta `GET`: un prefetch del navegador,
 *    un bot o un reintento dispararían el cargo. Lo vigila
 *    `test/regression-asegura-gasto-codeoscopic.test.ts`.
 *
 * 3. **El gasto pasa por `cotizar()`**, el único embudo: ahí viven el
 *    interruptor (`CODEOSCOPIC_TARIFICACION_ACTIVA`), el libro de consumo
 *    persistente y el tope diario. Esta ruta no habla con el vendor por su
 *    cuenta — y esa llamada está escrita AQUÍ, a la vista, no escondida en el
 *    lib, porque es así como el guardián de gasto reconoce esta ruta y le
 *    prohíbe exponer un `GET`.
 *
 * 4. **Aislamiento por correduría** antes de tocar la póliza: lo resuelve
 *    `prepararRetarificacion()` (`correduriaUnica()` + `origenRetarificacion()`)
 *    en el lib compartido, así que un `polizaId` de otra correduría es un 404,
 *    no una cotización.
 *
 * ── Cuerpo ──────────────────────────────────────────────────────────────────
 *   { polizaId, confirmado: true, solicitadoPor?, resueltos?, correcciones?, catastro? }
 *
 * ── Respuesta ───────────────────────────────────────────────────────────────
 * **La MISMA** que `POST /api/cartera/polizas/{id}/retarificar`, campo por
 * campo y código por código (402 tope · 502 vendor · 503 resto · 422 faltan
 * datos · 409 ramo · 404 póliza), porque la preparan y la redactan las mismas
 * dos funciones del lib compartido. La única diferencia con su gemela es quién
 * autoriza y de dónde sale `solicitadoPor`.
 */
export async function POST(req: Request) {
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

  const polizaId = typeof cuerpo.polizaId === 'string' ? cuerpo.polizaId.trim() : ''
  if (polizaId === '') {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'falta polizaId', gastado: '0,00€' },
      { status: 400 },
    )
  }

  // Quién responde de este cargo. Va al libro de consumo, así que no se inventa
  // un nombre: si plataforma no lo manda, se dice que vino por el puerto.
  const solicitadoPor =
    typeof cuerpo.solicitadoPor === 'string' && cuerpo.solicitadoPor.trim() !== ''
      ? cuerpo.solicitadoPor.trim()
      : 'plataforma'

  // `datos` se acepta como nombre alternativo de `correcciones` (es como lo
  // llama el contrato de la pantalla de plataforma). Manda `correcciones` si
  // vienen los dos: no se funden, porque fundirlos escondería un desacuerdo.
  const correcciones = esObjeto(cuerpo.correcciones)
    ? cuerpo.correcciones
    : esObjeto(cuerpo.datos)
      ? cuerpo.datos
      : undefined

  const p = await prepararRetarificacion({
    polizaId,
    solicitadoPor,
    cuerpo: {
      resueltos: esObjeto(cuerpo.resueltos) ? cuerpo.resueltos : undefined,
      correcciones,
      catastro: esObjeto(cuerpo.catastro) ? cuerpo.catastro : null,
    } satisfies CuerpoRetarificacion,
  })
  // Corta ANTES del vendor (422 faltan datos · 409 ramo · 404 póliza · 503):
  // esas respuestas llevan `gastado: '0,00€'`.
  if (p.estado === 'corte') {
    return NextResponse.json(p.respuesta.cuerpo, { status: p.respuesta.status })
  }

  // ── La única línea que cuesta dinero, por el único embudo ────────────────
  const r = await cotizar(p.peticion)

  const res = respuestaRetarificacion(r, p)
  return NextResponse.json(res.cuerpo, { status: res.status })
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
