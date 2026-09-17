import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { cotizar } from '@/lib/codeoscopic/cotizar'
import { prepararRetarificacionNuevaHogar } from '@/lib/retarificar-cartera'
import { respuestaRetarificacion, type CuerpoRetarificacion } from '@/lib/retarificar-cartera'
import { direccionDesdeCatastro, type CatastroHogar } from '@/lib/codeoscopic/desde-cartera-hogar'
import { paramsDnploc } from '@central/core-catastro'
import { bajarCatastro } from '@central/core-catastro/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// La cotización del vendor puede tardar hasta 150 s (documentado). Sin este
// margen Vercel corta antes y nos quedamos sin saber si nos han cobrado — que
// es justo el estado que el libro de consumo tiene que contar como gasto.
export const maxDuration = 180

const RE_REF20 = /^[0-9A-Z]{20}$/

/**
 * `POST /api/operador/codeoscopic/hogar-nuevo` — presupuesto de HOGAR para un
 * cliente que HOY no tiene ninguna póliza (oportunidad nueva), desde
 * `apps/plataforma` → `/correduria`, que es la única pantalla que Alberto abre.
 *
 * **GASTA 0,50€ REALES por llamada.** Hermana de
 * `POST /api/operador/codeoscopic/retarificar` (esa retarifica una póliza
 * existente; esta cotiza desde el Catastro sin ninguna): las cuatro
 * salvaguardas son las mismas y por el mismo motivo — léelas en la cabecera
 * de esa ruta. Resumen:
 *
 * 1. **`confirmado === true` ESTRICTO** — sin él, 400 y no se llama a nadie.
 * 2. **Solo `POST`.** Este fichero NO exporta `GET`. Lo vigila
 *    `test/regression-asegura-gasto-codeoscopic.test.ts`.
 * 3. **El gasto pasa por `cotizar()`**, el único embudo, llamado AQUÍ, a la
 *    vista, no escondido en el lib.
 * 4. **Aislamiento por correduría** antes de tocar el cliente:
 *    `prepararRetarificacionNuevaHogar()` resuelve `correduriaUnica()` +
 *    `clienteOrigenDe()`, así que un `clienteId` de otra correduría es un
 *    404, no una cotización.
 *
 * A diferencia de una póliza existente, aquí NO hay ficha de la que sacar el
 * riesgo: el Catastro se consulta DE NUEVO, en el servidor, en cada llamada
 * — nunca se confía en lo que la pantalla diga que vio, porque de eso
 * depende m²/año/CP, que son parte del precio.
 *
 * ── Cuerpo ──────────────────────────────────────────────────────────────────
 *   { clienteId, referencia, confirmado: true, solicitadoPor?, resueltos?, correcciones? }
 *
 * ── Respuesta ───────────────────────────────────────────────────────────────
 * La MISMA que `POST /api/cartera/cliente/{id}/hogar-nuevo` de asegura, campo
 * por campo (402 tope · 502 vendor · 503 resto · 422 faltan datos · 409 ramo
 * · 404 cliente/Catastro), porque la preparan y la redactan las mismas
 * funciones del lib compartido.
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

  const clienteId = typeof cuerpo.clienteId === 'string' ? cuerpo.clienteId.trim() : ''
  if (clienteId === '') {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'falta clienteId', gastado: '0,00€' },
      { status: 400 },
    )
  }

  const referencia =
    typeof cuerpo.referencia === 'string' ? cuerpo.referencia.replace(/[\s-]/g, '').toUpperCase() : ''
  if (!RE_REF20.test(referencia)) {
    return NextResponse.json(
      {
        error:
          'Falta (o no vale) la referencia catastral de 20 caracteres del piso. La de 14 es la del ' +
          'edificio y no trae m² ni año.',
        gastado: '0,00€',
      },
      { status: 422 },
    )
  }

  let catastro: CatastroHogar
  try {
    const datos = await bajarCatastro(referencia)
    if (datos === null) {
      return NextResponse.json(
        { error: 'El Catastro no tiene nada con esa referencia. No se cotiza sin saber el riesgo.', gastado: '0,00€' },
        { status: 404 },
      )
    }
    catastro = {
      metrosCuadrados: datos.superficie,
      anioConstruccion: datos.anioConstruccion,
      codigoPostal: datos.codigoPostal,
      uso: datos.uso,
      direccion: direccionDesdeCatastro(paramsDnploc(datos.direccion)),
    }
  } catch (e) {
    // Un fallo de RED no es «no existe»: es «no se ha podido mirar». No se
    // cotiza sobre un riesgo que no se ha podido leer.
    return NextResponse.json(
      {
        error: `No se ha podido consultar el Catastro (${e instanceof Error ? e.message : String(e)}). No se cotiza sin el riesgo.`,
        gastado: '0,00€',
      },
      { status: 503 },
    )
  }

  // Quién responde de este cargo. Va al libro de consumo, así que no se inventa
  // un nombre: si plataforma no lo manda, se dice que vino por el puerto.
  const solicitadoPor =
    typeof cuerpo.solicitadoPor === 'string' && cuerpo.solicitadoPor.trim() !== ''
      ? cuerpo.solicitadoPor.trim()
      : 'plataforma'

  const p = await prepararRetarificacionNuevaHogar({
    clienteId,
    solicitadoPor,
    cuerpo: {
      resueltos: esObjeto(cuerpo.resueltos) ? cuerpo.resueltos : undefined,
      correcciones: esObjeto(cuerpo.correcciones) ? cuerpo.correcciones : undefined,
    } satisfies CuerpoRetarificacion,
    catastro,
  })
  // Corta ANTES del vendor (422 faltan datos · 409 ramo · 404 cliente · 503):
  // esas respuestas llevan `gastado: '0,00€'` y son el caso normal.
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
